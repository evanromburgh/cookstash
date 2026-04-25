function parseLeadingQuantityToken(raw: string): { token: string; value: number } | null {
  const trimmed = raw.trim();
  const match = trimmed.match(/^(\d+(?:\.\d+)?(?:\s+\d+\/\d+)?|\d+\/\d+)/);
  if (!match) {
    return null;
  }

  const token = match[1];

  if (token.includes(" ")) {
    const [wholeRaw, fractionRaw] = token.split(/\s+/, 2);
    const [numRaw, denRaw] = fractionRaw.split("/", 2);
    const whole = Number(wholeRaw);
    const numerator = Number(numRaw);
    const denominator = Number(denRaw);
    if (
      Number.isFinite(whole) &&
      Number.isFinite(numerator) &&
      Number.isFinite(denominator) &&
      denominator !== 0
    ) {
      return { token, value: whole + numerator / denominator };
    }
    return null;
  }

  if (token.includes("/")) {
    const [numRaw, denRaw] = token.split("/", 2);
    const numerator = Number(numRaw);
    const denominator = Number(denRaw);
    if (Number.isFinite(numerator) && Number.isFinite(denominator) && denominator !== 0) {
      return { token, value: numerator / denominator };
    }
    return null;
  }

  const value = Number(token);
  if (!Number.isFinite(value)) {
    return null;
  }

  return { token, value };
}

function formatScaledQuantity(value: number): string {
  const rounded = Math.round(value * 100) / 100;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(2).replace(/\.?0+$/, "");
}

export function getNonblankIngredientLines(ingredients: unknown): string[] {
  if (!Array.isArray(ingredients)) {
    return [];
  }

  return ingredients
    .map((item) => (typeof item === "string" ? item.trim() : ""))
    .filter((item) => item.length > 0);
}

export function applyIngredientScale(line: string, scale: number): string {
  if (scale === 1) {
    return line;
  }

  const parsed = parseLeadingQuantityToken(line);
  if (!parsed) {
    return line;
  }

  const scaled = parsed.value * scale;
  return line.replace(parsed.token, formatScaledQuantity(scaled));
}

export function buildShoppingListItemRows(
  ingredients: unknown,
  scale: number,
  shoppingListId: string,
  userId: string,
  sourceRecipeId: string,
) {
  const lines = getNonblankIngredientLines(ingredients);
  return lines.map((line, index) => ({
    shopping_list_id: shoppingListId,
    user_id: userId,
    item_text: applyIngredientScale(line, scale),
    position: index,
    source_recipe_id: sourceRecipeId,
  }));
}
