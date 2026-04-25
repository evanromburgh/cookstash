/** Curated labels users can pick quickly; any other string can be added as a custom tag. */
export const RECIPE_PREDEFINED_TAGS = [
  "breakfast",
  "lunch",
  "dinner",
  "snack",
  "dessert",
  "vegetarian",
  "vegan",
  "quick",
  "weeknight",
  "meal-prep",
  "one-pot",
  "baking",
  "budget",
  "crowd-pleaser",
] as const;

const PREDEFINED_SET = new Set<string>(RECIPE_PREDEFINED_TAGS);

const MAX_TAGS = 20;
const MAX_TAG_LEN = 40;

function truncateTag(value: string): string {
  const t = value.trim();
  if (!t) {
    return "";
  }
  return t.length > MAX_TAG_LEN ? t.slice(0, MAX_TAG_LEN) : t;
}

/** Merge preset selections and freeform lines/comma-separated custom tags; dedupe case-insensitively. */
export function mergeRecipeTags(presetSlugs: string[], customRaw: string): string[] {
  const fromPresets = presetSlugs.map(truncateTag).filter((t) => t && PREDEFINED_SET.has(t));

  const fromCustom = customRaw
    .split(/[,\n]/)
    .map((s) => truncateTag(s))
    .filter(Boolean);

  const merged = [...fromPresets, ...fromCustom];
  const seen = new Set<string>();
  const out: string[] = [];

  for (const t of merged) {
    const key = t.toLowerCase();
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    out.push(t);
    if (out.length >= MAX_TAGS) {
      break;
    }
  }

  return out;
}

export function parseTagsFromRow(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((item): item is string => typeof item === "string" && item.length > 0);
}
