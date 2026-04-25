import { NextResponse } from "next/server";

import { fetchPageHtml } from "@/lib/url-import/fetch-page-html";
import {
  extractFirstJsonLdRecipeFromHtml,
  extractJsonLdRecipeCandidatesFromHtml,
} from "@/lib/url-import/jsonld-recipe";
import { canonicalizeUrl } from "@/lib/url-import/canonicalize-url";
import { isFeatureEnabled } from "@/lib/feature-flags";
import { createServerSupabaseClient } from "@/lib/supabase/server";

function extractHtmlTitle(html: string): string | null {
  const match = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  if (!match?.[1]) {
    return null;
  }
  const normalized = match[1]
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/\s+/g, " ")
    .trim();
  return normalized.length > 0 ? normalized.slice(0, 160) : null;
}

function classifyImportError(message: string): { status: number; body: string } {
  const lower = message.toLowerCase();
  if (
    lower.includes("invalid url") ||
    lower.includes("invalid host") ||
    lower.includes("host is not allowed") ||
    lower.includes("only http") ||
    lower.includes("credentials") ||
    lower.includes("url is too long")
  ) {
    return { status: 400, body: message };
  }
  if (lower.includes("did not return html")) {
    return { status: 422, body: message };
  }
  if (lower.includes("too large")) {
    return { status: 413, body: message };
  }
  return { status: 502, body: message };
}

const PARSE_CACHE_TTL_MS = 30_000;

type CachedImportParse = {
  expiresAt: number;
  finalUrl: string;
  recipe: ReturnType<typeof extractFirstJsonLdRecipeFromHtml>;
  recipeCandidates: ReturnType<typeof extractJsonLdRecipeCandidatesFromHtml>;
  fallbackName: string;
};

const importParseCache = new Map<string, CachedImportParse>();

function getCachedImportParse(canonicalUrl: string): CachedImportParse | null {
  const cached = importParseCache.get(canonicalUrl);
  if (!cached) {
    return null;
  }
  if (cached.expiresAt <= Date.now()) {
    importParseCache.delete(canonicalUrl);
    return null;
  }
  return cached;
}

function setCachedImportParse(canonicalUrl: string, value: Omit<CachedImportParse, "expiresAt">): void {
  importParseCache.set(canonicalUrl, {
    ...value,
    expiresAt: Date.now() + PARSE_CACHE_TTL_MS,
  });
}

export async function POST(request: Request) {
  const enabled = await isFeatureEnabled("url_import");

  if (!enabled) {
    return NextResponse.json(
      { error: "URL import is currently disabled by feature flag." },
      { status: 503 },
    );
  }

  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const url =
    typeof body === "object" &&
    body !== null &&
    "url" in body &&
    typeof (body as { url: unknown }).url === "string"
      ? (body as { url: string }).url.trim()
      : "";

  if (!url) {
    return NextResponse.json({ error: "url is required" }, { status: 400 });
  }

  try {
    const canonicalInputUrl = canonicalizeUrl(url);
    const cached = getCachedImportParse(canonicalInputUrl);

    let finalUrl: string;
    let recipe: ReturnType<typeof extractFirstJsonLdRecipeFromHtml>;
    let recipeCandidates: ReturnType<typeof extractJsonLdRecipeCandidatesFromHtml>;
    let fallbackName: string;

    if (cached) {
      ({ finalUrl, recipe, recipeCandidates, fallbackName } = cached);
    } else {
      const page = await fetchPageHtml(canonicalInputUrl);
      finalUrl = canonicalizeUrl(page.finalUrl);
      recipeCandidates = extractJsonLdRecipeCandidatesFromHtml(page.html);
      recipe = recipeCandidates[0] ?? null;
      fallbackName = extractHtmlTitle(page.html) ?? "Imported recipe";
      setCachedImportParse(canonicalInputUrl, {
        finalUrl,
        recipe,
        recipeCandidates,
        fallbackName,
      });
    }

    const { data: duplicate } = await supabase
      .from("recipes")
      .select("id, name")
      .eq("user_id", user.id)
      .eq("source_url", finalUrl)
      .limit(1)
      .maybeSingle();

    if (!recipe) {
      return NextResponse.json(
        {
          error:
            "This page can't be auto-imported because it does not expose a supported schema.org Recipe payload.",
          fallback: {
            name: fallbackName,
            sourceUrl: finalUrl,
          },
          duplicateOf: duplicate ?? null,
        },
        { status: 422 },
      );
    }

    const response = {
      name: recipe.name,
      ingredients: recipe.ingredients,
      instructions: recipe.instructions,
      sourceUrl: finalUrl,
      duplicateOf: duplicate ?? null,
    };

    if (recipeCandidates.length > 1) {
      return NextResponse.json({
        ...response,
        candidates: recipeCandidates,
      });
    }

    return NextResponse.json(response);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Import failed";
    const { status, body: errBody } = classifyImportError(message);
    return NextResponse.json({ error: errBody }, { status });
  }
}
