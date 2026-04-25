import { NextResponse } from "next/server";

import { getPublicEnvironment } from "@/lib/env";
import { isFeatureEnabled } from "@/lib/feature-flags";
import { mintShareToken, resolveSharedRecipeByToken, hashShareToken } from "@/lib/recipe-sharing";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { logDestructiveAuditRecord } from "@/lib/audit-log";

type ShareAction = "create" | "regenerate" | "revoke" | "saveCopy";
type RecipeSharePayload = {
  action?: unknown;
  recipeId?: unknown;
  token?: unknown;
};

function normalizeBody(body: unknown): RecipeSharePayload {
  if (!body || typeof body !== "object") {
    return {};
  }
  return body as RecipeSharePayload;
}

export async function GET(request: Request) {
  const enabled = await isFeatureEnabled("recipe_sharing");
  if (!enabled) {
    return NextResponse.json({ error: "Recipe sharing is currently disabled by feature flag." }, { status: 503 });
  }

  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const token = url.searchParams.get("token")?.trim() ?? "";
  if (!token) {
    return NextResponse.json({ error: "token is required" }, { status: 400 });
  }

  const shared = await resolveSharedRecipeByToken(token);
  if (!shared) {
    return NextResponse.json({ error: "Share link is invalid or has been revoked." }, { status: 404 });
  }

  return NextResponse.json({
    ownerUserId: shared.ownerUserId,
    recipe: shared.recipe,
  });
}

export async function POST(request: Request) {
  const enabled = await isFeatureEnabled("recipe_sharing");
  if (!enabled) {
    return NextResponse.json({ error: "Recipe sharing is currently disabled by feature flag." }, { status: 503 });
  }

  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const body = normalizeBody(rawBody);
  const action = typeof body.action === "string" ? (body.action as ShareAction) : "";
  const recipeId = typeof body.recipeId === "string" ? body.recipeId.trim() : "";
  const token = typeof body.token === "string" ? body.token.trim() : "";

  if (action === "saveCopy") {
    if (!token) {
      return NextResponse.json({ error: "token is required" }, { status: 400 });
    }

    const shared = await resolveSharedRecipeByToken(token);
    if (!shared) {
      return NextResponse.json({ error: "Share link is invalid or has been revoked." }, { status: 404 });
    }

    const copyName = `${shared.recipe.name} (Shared copy)`.slice(0, 160);
    const now = new Date().toISOString();
    const { data: copyRow, error: copyError } = await supabase
      .from("recipes")
      .insert({
        user_id: user.id,
        name: copyName,
        source_url: shared.recipe.source_url,
        instructions: shared.recipe.instructions,
        ingredients: Array.isArray(shared.recipe.ingredients) ? shared.recipe.ingredients : [],
        tags: Array.isArray(shared.recipe.tags) ? shared.recipe.tags : [],
        updated_at: now,
      })
      .select("id, name, user_id, created_at")
      .single();

    if (copyError || !copyRow) {
      return NextResponse.json({ error: copyError?.message ?? "Could not save recipe copy." }, { status: 400 });
    }

    return NextResponse.json({ savedRecipe: copyRow }, { status: 201 });
  }

  if (action !== "create" && action !== "regenerate" && action !== "revoke") {
    return NextResponse.json(
      { error: "action must be one of: create, regenerate, revoke, saveCopy" },
      { status: 400 },
    );
  }

  if (!recipeId) {
    return NextResponse.json({ error: "recipeId is required" }, { status: 400 });
  }

  const { data: ownedRecipe, error: readError } = await supabase
    .from("recipes")
    .select("id, user_id")
    .eq("id", recipeId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (readError || !ownedRecipe) {
    return NextResponse.json({ error: "Recipe not found" }, { status: 404 });
  }

  if (action === "revoke") {
    const revokedAt = new Date().toISOString();
    const { error: revokeError } = await supabase
      .from("recipe_share_links")
      .update({
        revoked_at: revokedAt,
        token_hash: null,
        updated_at: revokedAt,
      })
      .eq("recipe_id", recipeId)
      .eq("owner_user_id", user.id);

    if (revokeError) {
      return NextResponse.json({ error: revokeError.message }, { status: 400 });
    }

    await logDestructiveAuditRecord(supabase, {
      actorUserId: user.id,
      actionType: "recipe_share_revoke",
      targetType: "recipe_share_link",
      targetId: recipeId,
      happenedAt: revokedAt,
    });

    return NextResponse.json({ status: "revoked" });
  }

  const rawToken = mintShareToken();
  const tokenHash = hashShareToken(rawToken);
  const nowIso = new Date().toISOString();

  const { error: upsertError } = await supabase.from("recipe_share_links").upsert(
    {
      owner_user_id: user.id,
      recipe_id: recipeId,
      token_hash: tokenHash,
      revoked_at: null,
      updated_at: nowIso,
    },
    { onConflict: "recipe_id" },
  );

  if (upsertError) {
    return NextResponse.json({ error: upsertError.message }, { status: 400 });
  }

  const shareUrl = `${getPublicEnvironment().siteUrl.replace(/\/+$/, "")}/shared/recipe?token=${encodeURIComponent(rawToken)}`;
  return NextResponse.json({
    status: action === "create" ? "created" : "regenerated",
    shareUrl,
    token: rawToken,
  });
}
