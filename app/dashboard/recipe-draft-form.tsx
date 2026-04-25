"use client";

import { useEffect, useMemo, useState } from "react";

import { RECIPE_PREDEFINED_TAGS } from "@/lib/recipe-tags";

type LibraryQuery = { q?: string; favorites?: string; tag?: string };

type RecipeDraftSnapshot = {
  name: string;
  sourceUrl: string;
  ingredients: string;
  instructions: string;
  presetTags: string[];
  customTags: string;
};

type RecipeDraftFormProps = {
  mode: "create" | "edit";
  recipeId?: string;
  libraryQuery: LibraryQuery;
  action: (formData: FormData) => void | Promise<void>;
  submitLabel: string;
  initialValues: RecipeDraftSnapshot;
};

function normalizeSnapshot(snapshot: RecipeDraftSnapshot): RecipeDraftSnapshot {
  const presetTags = snapshot.presetTags
    .map((tag) => tag.trim())
    .filter((tag) => tag.length > 0)
    .sort((a, b) => a.localeCompare(b));
  return {
    name: snapshot.name,
    sourceUrl: snapshot.sourceUrl,
    ingredients: snapshot.ingredients,
    instructions: snapshot.instructions,
    presetTags,
    customTags: snapshot.customTags,
  };
}

function snapshotsMatch(left: RecipeDraftSnapshot, right: RecipeDraftSnapshot): boolean {
  return JSON.stringify(normalizeSnapshot(left)) === JSON.stringify(normalizeSnapshot(right));
}

function libraryHiddenFields(query: LibraryQuery) {
  const q = typeof query.q === "string" ? query.q : "";
  const tag = typeof query.tag === "string" ? query.tag.trim() : "";
  return (
    <>
      {q.trim() ? <input type="hidden" name="lib_q" value={q} /> : null}
      {query.favorites === "1" ? <input type="hidden" name="lib_favorites" value="1" /> : null}
      {tag ? <input type="hidden" name="lib_tag" value={tag} /> : null}
    </>
  );
}

export function RecipeDraftForm({
  mode,
  recipeId,
  libraryQuery,
  action,
  submitLabel,
  initialValues,
}: RecipeDraftFormProps) {
  const baseSnapshot = useMemo(() => normalizeSnapshot(initialValues), [initialValues]);
  const storageKey = useMemo(
    () => `cookstash:recipe-draft:${mode === "create" ? "new" : recipeId ?? "missing-id"}`,
    [mode, recipeId],
  );
  const [values, setValues] = useState<RecipeDraftSnapshot>(baseSnapshot);
  const [pendingDraft, setPendingDraft] = useState<RecipeDraftSnapshot | null>(() => {
    if (typeof window === "undefined") {
      return null;
    }
    try {
      const raw = localStorage.getItem(storageKey);
      if (!raw) {
        return null;
      }
      const parsed = JSON.parse(raw) as RecipeDraftSnapshot;
      if (snapshotsMatch(parsed, baseSnapshot)) {
        localStorage.removeItem(storageKey);
        return null;
      }
      return normalizeSnapshot(parsed);
    } catch {
      return null;
    }
  });

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      try {
        if (snapshotsMatch(values, baseSnapshot)) {
          localStorage.removeItem(storageKey);
          return;
        }
        localStorage.setItem(storageKey, JSON.stringify(values));
      } catch {
        // Ignore storage errors so the form remains usable.
      }
    }, 600);

    return () => window.clearTimeout(timeout);
  }, [baseSnapshot, storageKey, values]);

  function clearDraft() {
    try {
      localStorage.removeItem(storageKey);
    } catch {
      // Ignore storage errors so submit/discard still works.
    }
    setPendingDraft(null);
  }

  return (
    <form
      action={action}
      className="grid gap-3"
      onSubmit={() => {
        clearDraft();
      }}
    >
      {libraryHiddenFields(libraryQuery)}
      {mode === "edit" && recipeId ? <input type="hidden" name="recipeId" value={recipeId} /> : null}
      {pendingDraft ? (
        <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-100">
          <p className="font-medium">Local draft found for this form.</p>
          <div className="mt-2 flex flex-wrap gap-2">
            <button
              type="button"
              className="rounded border border-amber-400 px-3 py-1.5"
              onClick={() => {
                setValues(normalizeSnapshot(pendingDraft));
                setPendingDraft(null);
              }}
            >
              Restore draft
            </button>
            <button
              type="button"
              className="rounded border border-amber-400 px-3 py-1.5"
              onClick={() => {
                clearDraft();
                setValues(baseSnapshot);
              }}
            >
              Discard draft
            </button>
          </div>
        </div>
      ) : null}
      <input
        name="name"
        required
        value={values.name}
        onChange={(event) => setValues((prev) => ({ ...prev, name: event.target.value }))}
        placeholder="Recipe name"
        className="rounded border px-3 py-2"
      />
      <input
        name="sourceUrl"
        value={values.sourceUrl}
        onChange={(event) => setValues((prev) => ({ ...prev, sourceUrl: event.target.value }))}
        placeholder="Source URL (optional)"
        className="rounded border px-3 py-2"
      />
      <textarea
        name="ingredients"
        rows={4}
        value={values.ingredients}
        onChange={(event) => setValues((prev) => ({ ...prev, ingredients: event.target.value }))}
        placeholder={"Ingredients (one per line)\nExample: 2 tomatoes"}
        className="rounded border px-3 py-2"
      />
      <textarea
        name="instructions"
        rows={4}
        value={values.instructions}
        onChange={(event) => setValues((prev) => ({ ...prev, instructions: event.target.value }))}
        placeholder="Instructions (optional)"
        className="rounded border px-3 py-2"
      />
      <fieldset className="grid gap-2 rounded border border-zinc-200 p-3 dark:border-zinc-700">
        <legend className="px-1 text-sm font-medium">Tags (optional)</legend>
        <p className="text-xs text-zinc-500">
          Pick quick labels and/or add your own (comma or line separated).
        </p>
        <div className="flex flex-wrap gap-x-3 gap-y-2">
          {RECIPE_PREDEFINED_TAGS.map((tag) => (
            <label key={`${mode}-${recipeId ?? "new"}-${tag}`} className="flex items-center gap-1.5 text-sm capitalize">
              <input
                type="checkbox"
                name="presetTag"
                value={tag}
                checked={values.presetTags.some((presetTag) => presetTag.toLowerCase() === tag)}
                onChange={(event) =>
                  setValues((prev) => {
                    const nextPreset = prev.presetTags.filter((presetTag) => presetTag.toLowerCase() !== tag);
                    if (event.target.checked) {
                      nextPreset.push(tag);
                    }
                    return {
                      ...prev,
                      presetTags: nextPreset,
                    };
                  })
                }
                className="rounded border"
              />
              {tag.replace(/-/g, " ")}
            </label>
          ))}
        </div>
        <textarea
          name="customTags"
          rows={2}
          value={values.customTags}
          onChange={(event) => setValues((prev) => ({ ...prev, customTags: event.target.value }))}
          placeholder="Custom tags, e.g. italian, kid-friendly"
          className="rounded border px-3 py-2 text-sm"
        />
      </fieldset>
      <div className="flex flex-wrap gap-2">
        <button className="w-fit rounded bg-black px-4 py-2 text-white" type="submit">
          {submitLabel}
        </button>
        <button
          type="button"
          className="rounded border px-4 py-2 text-sm"
          onClick={() => {
            clearDraft();
            setValues(baseSnapshot);
          }}
        >
          Discard local draft
        </button>
      </div>
    </form>
  );
}
