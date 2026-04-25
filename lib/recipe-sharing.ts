import { createHash, randomBytes } from "node:crypto";

import { createServiceRoleClient } from "@/lib/supabase/server";

const SHARE_TOKEN_BYTES = 32;

export function hashShareToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function mintShareToken(): string {
  return randomBytes(SHARE_TOKEN_BYTES).toString("base64url");
}

export async function resolveSharedRecipeByToken(token: string) {
  const serviceClient = createServiceRoleClient();
  const tokenHash = hashShareToken(token);

  const { data: linkRow, error: linkError } = await serviceClient
    .from("recipe_share_links")
    .select("id, owner_user_id, recipe_id, revoked_at")
    .eq("token_hash", tokenHash)
    .is("revoked_at", null)
    .maybeSingle();

  if (linkError || !linkRow) {
    return null;
  }

  const { data: recipeRow, error: recipeError } = await serviceClient
    .from("recipes")
    .select("id, user_id, name, source_url, instructions, ingredients, tags")
    .eq("id", linkRow.recipe_id)
    .eq("user_id", linkRow.owner_user_id)
    .maybeSingle();

  if (recipeError || !recipeRow) {
    return null;
  }

  return {
    linkId: linkRow.id,
    ownerUserId: linkRow.owner_user_id,
    recipe: recipeRow,
  };
}
