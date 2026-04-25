import { NextResponse } from "next/server";

import { fetchPageHtml } from "@/lib/url-import/fetch-page-html";
import { extractFirstJsonLdRecipeFromHtml } from "@/lib/url-import/jsonld-recipe";
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
    const { finalUrl, html } = await fetchPageHtml(url);
    const recipe = extractFirstJsonLdRecipeFromHtml(html);
    const { data: duplicate } = await supabase
      .from("recipes")
      .select("id, name")
      .eq("user_id", user.id)
      .eq("source_url", finalUrl)
      .limit(1)
      .maybeSingle();

    if (!recipe) {
      const fallbackName = extractHtmlTitle(html) ?? "Imported recipe";
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

    return NextResponse.json({
      name: recipe.name,
      ingredients: recipe.ingredients,
      instructions: recipe.instructions,
      sourceUrl: finalUrl,
      duplicateOf: duplicate ?? null,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Import failed";
    const { status, body: errBody } = classifyImportError(message);
    return NextResponse.json({ error: errBody }, { status });
  }
}
