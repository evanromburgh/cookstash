import { NextResponse } from "next/server";

import { recipeHasNonblankIngredients } from "@/lib/recipe-ingredients";
import { buildShoppingListItemRows } from "@/lib/shopping-list-items";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export async function POST(request: Request) {
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

  const recipeId =
    typeof body === "object" &&
    body !== null &&
    "recipeId" in body &&
    typeof (body as { recipeId: unknown }).recipeId === "string"
      ? (body as { recipeId: string }).recipeId.trim()
      : "";
  const scaleRaw =
    typeof body === "object" && body !== null && "scale" in body ? Number((body as { scale: unknown }).scale) : 1;
  const scale = Number.isFinite(scaleRaw) && scaleRaw > 0 ? Math.round(scaleRaw * 1000) / 1000 : NaN;

  if (!recipeId) {
    return NextResponse.json({ error: "recipeId is required" }, { status: 400 });
  }
  if (!Number.isFinite(scale)) {
    return NextResponse.json({ error: "scale must be a positive number" }, { status: 400 });
  }

  const { data: recipe, error: recipeError } = await supabase
    .from("recipes")
    .select("id, name, ingredients, user_id")
    .eq("id", recipeId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (recipeError || !recipe) {
    return NextResponse.json({ error: "Recipe not found" }, { status: 404 });
  }

  if (!recipeHasNonblankIngredients(recipe.ingredients)) {
    return NextResponse.json(
      { error: "Draft recipes cannot be used to create shopping lists" },
      { status: 422 },
    );
  }

  const listName = `Shopping: ${recipe.name ?? "Recipe"}`.slice(0, 200);

  const { data: row, error: insertError } = await supabase
    .from("shopping_lists")
    .insert({
      user_id: user.id,
      recipe_id: recipe.id,
      name: listName,
      scale,
    })
    .select("id, name, scale, created_at")
    .single();

  if (insertError || !row) {
    return NextResponse.json({ error: insertError?.message ?? "Insert failed" }, { status: 400 });
  }

  const itemRows = buildShoppingListItemRows(recipe.ingredients, scale, row.id, user.id, recipe.id);
  const { error: itemInsertError } = await supabase.from("shopping_list_items").insert(itemRows);
  if (itemInsertError) {
    await supabase.from("shopping_lists").delete().eq("id", row.id).eq("user_id", user.id);
    return NextResponse.json({ error: itemInsertError.message }, { status: 400 });
  }

  return NextResponse.json(row, { status: 201 });
}
