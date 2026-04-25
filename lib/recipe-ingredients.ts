export function recipeHasNonblankIngredients(ingredients: unknown): boolean {
  if (!Array.isArray(ingredients)) {
    return false;
  }

  return ingredients.some((item) => typeof item === "string" && item.trim().length > 0);
}
