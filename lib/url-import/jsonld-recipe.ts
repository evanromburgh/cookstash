/**
 * Deterministic extraction: first <script type="application/ld+json"> in document order
 * whose JSON contains a schema.org Recipe node (including @graph), using the first
 * matching Recipe with usable fields.
 */

const LD_JSON_SCRIPT =
  /<script[^>]*\btype\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;

const MAX_NAME_LEN = 160;
const MAX_INGREDIENT_LINES = 250;
const MAX_INSTRUCTIONS_LEN = 120_000;

export type ExtractedJsonLdRecipe = {
  name: string;
  ingredients: string[];
  instructions: string | null;
};

function flattenJsonLdNodes(parsed: unknown): Record<string, unknown>[] {
  if (parsed === null || parsed === undefined) {
    return [];
  }
  if (Array.isArray(parsed)) {
    return parsed.flatMap((item) => flattenJsonLdNodes(item));
  }
  if (typeof parsed === "object" && parsed !== null && "@graph" in parsed) {
    const g = (parsed as { "@graph": unknown })["@graph"];
    if (Array.isArray(g)) {
      return g.flatMap((item) => flattenJsonLdNodes(item));
    }
  }
  if (typeof parsed === "object" && parsed !== null) {
    return [parsed as Record<string, unknown>];
  }
  return [];
}

function hasRecipeType(node: Record<string, unknown>): boolean {
  const t = node["@type"];
  if (t === "Recipe") {
    return true;
  }
  if (Array.isArray(t)) {
    return t.some((x) => x === "Recipe");
  }
  return false;
}

function pickName(node: Record<string, unknown>): string {
  for (const key of ["name", "headline"]) {
    const v = node[key];
    if (typeof v === "string") {
      const s = v.trim().replace(/\s+/g, " ");
      if (s.length > 0) {
        return s.slice(0, MAX_NAME_LEN);
      }
    }
  }
  return "";
}

function ingredientLineFromItem(item: unknown): string | null {
  if (typeof item === "string") {
    const t = item.trim().replace(/\s+/g, " ");
    return t.length > 0 ? t : null;
  }
  if (item && typeof item === "object") {
    const o = item as Record<string, unknown>;
    for (const key of ["text", "value", "name"]) {
      const v = o[key];
      if (typeof v === "string") {
        const t = v.trim().replace(/\s+/g, " ");
        if (t.length > 0) {
          return t;
        }
      }
    }
  }
  return null;
}

function normalizeIngredients(raw: unknown): string[] {
  if (raw === null || raw === undefined) {
    return [];
  }
  const out: string[] = [];
  if (typeof raw === "string") {
    const line = ingredientLineFromItem(raw);
    if (line) {
      out.push(line);
    }
    return out.slice(0, MAX_INGREDIENT_LINES);
  }
  if (!Array.isArray(raw)) {
    return [];
  }
  for (const item of raw) {
    const line = ingredientLineFromItem(item);
    if (line) {
      out.push(line);
    }
    if (out.length >= MAX_INGREDIENT_LINES) {
      break;
    }
  }
  return out;
}

function instructionFragment(raw: unknown): string | null {
  if (typeof raw === "string") {
    const t = raw.trim();
    return t.length > 0 ? t : null;
  }
  if (raw && typeof raw === "object") {
    const o = raw as Record<string, unknown>;
    if (typeof o.text === "string" && o.text.trim()) {
      return o.text.trim();
    }
    if (Array.isArray(o.text)) {
      const joined = o.text.filter((x) => typeof x === "string").join(" ");
      const t = joined.trim();
      return t.length > 0 ? t : null;
    }
  }
  return null;
}

function normalizeInstructionsFromHowTo(node: Record<string, unknown>): string | null {
  const step = node.step;
  if (step === undefined || step === null) {
    return null;
  }
  const parts: string[] = [];
  const walk = (raw: unknown) => {
    if (raw === null || raw === undefined) {
      return;
    }
    if (Array.isArray(raw)) {
      for (const x of raw) {
        walk(x);
      }
      return;
    }
    const frag = instructionFragment(raw);
    if (frag) {
      parts.push(frag);
      return;
    }
    if (typeof raw === "object" && raw !== null) {
      const o = raw as Record<string, unknown>;
      if (o.itemListElement && Array.isArray(o.itemListElement)) {
        for (const el of o.itemListElement) {
          walk(el);
        }
        return;
      }
      if (o["@type"] === "HowToSection" || (Array.isArray(o["@type"]) && o["@type"].includes("HowToSection"))) {
        if (Array.isArray(o.itemListElement)) {
          for (const el of o.itemListElement) {
            walk(el);
          }
        }
      }
    }
  };
  walk(step);
  if (parts.length === 0) {
    return null;
  }
  const text = parts.join("\n\n");
  return text.slice(0, MAX_INSTRUCTIONS_LEN);
}

function normalizeInstructions(raw: unknown): string | null {
  if (raw === null || raw === undefined) {
    return null;
  }
  if (typeof raw === "string") {
    const t = raw.trim();
    return t.length > 0 ? t.slice(0, MAX_INSTRUCTIONS_LEN) : null;
  }
  if (Array.isArray(raw)) {
    const parts: string[] = [];
    for (const item of raw) {
      const frag = instructionFragment(item);
      if (frag) {
        parts.push(frag);
      }
    }
    if (parts.length === 0) {
      return null;
    }
    return parts.join("\n\n").slice(0, MAX_INSTRUCTIONS_LEN);
  }
  if (typeof raw === "object" && raw !== null) {
    const o = raw as Record<string, unknown>;
    const types = o["@type"];
    const isHowTo =
      types === "HowTo" ||
      types === "HowToSection" ||
      (Array.isArray(types) && (types.includes("HowTo") || types.includes("HowToSection")));
    if (isHowTo) {
      const fromHowTo = normalizeInstructionsFromHowTo(o);
      if (fromHowTo) {
        return fromHowTo;
      }
    }
    if (o.itemListElement && Array.isArray(o.itemListElement)) {
      const parts: string[] = [];
      for (const el of o.itemListElement) {
        const frag = instructionFragment(el);
        if (frag) {
          parts.push(frag);
        } else if (el && typeof el === "object") {
          const item = el as Record<string, unknown>;
          const nested = item.item;
          if (nested && typeof nested === "object") {
            const text = (nested as { text?: unknown }).text;
            if (typeof text === "string" && text.trim()) {
              parts.push(text.trim());
            }
          }
        }
      }
      if (parts.length > 0) {
        return parts.join("\n\n").slice(0, MAX_INSTRUCTIONS_LEN);
      }
    }
    if (typeof o.text === "string" && o.text.trim()) {
      return o.text.trim().slice(0, MAX_INSTRUCTIONS_LEN);
    }
  }
  return null;
}

function nodeHasUsableRecipeFields(
  name: string,
  ingredients: string[],
  instructions: string | null,
): boolean {
  return name.length > 0 || ingredients.length > 0 || Boolean(instructions && instructions.length > 0);
}

export function extractFirstJsonLdRecipeFromHtml(html: string): ExtractedJsonLdRecipe | null {
  LD_JSON_SCRIPT.lastIndex = 0;
  const matches = [...html.matchAll(LD_JSON_SCRIPT)];

  for (const match of matches) {
    const raw = match[1]?.trim();
    if (!raw) {
      continue;
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      continue;
    }

    const nodes = flattenJsonLdNodes(parsed);
    for (const node of nodes) {
      if (!hasRecipeType(node)) {
        continue;
      }
      const name = pickName(node);
      const ingredients = normalizeIngredients(node.recipeIngredient);
      const instructions = normalizeInstructions(node.recipeInstructions);
      if (!nodeHasUsableRecipeFields(name, ingredients, instructions)) {
        continue;
      }
      const resolvedName = name.length > 0 ? name : "Imported recipe";
      return {
        name: resolvedName.slice(0, MAX_NAME_LEN),
        ingredients,
        instructions,
      };
    }
  }

  return null;
}
