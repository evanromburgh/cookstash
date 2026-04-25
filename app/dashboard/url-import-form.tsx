"use client";

import { useState } from "react";

import { RECIPE_PREDEFINED_TAGS } from "@/lib/recipe-tags";

type LibraryQuery = { q?: string; favorites?: string; tag?: string };

function LibraryHiddenFields({ query }: { query: LibraryQuery }) {
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

type UrlImportPreview = {
  name: string;
  sourceUrl: string;
  ingredients: string;
  instructions: string;
  isFallback: boolean;
  duplicateOf: { id: string; name: string | null } | null;
};

type UrlImportApiOk = {
  name: string;
  ingredients: string[];
  instructions: string | null;
  sourceUrl: string;
};

type UrlImportApiErr = {
  error?: string;
  fallback?: { name?: string; sourceUrl?: string };
  duplicateOf?: { id: string; name: string | null } | null;
};

export type UrlImportFormProps = {
  enabled: boolean;
  libraryQuery: LibraryQuery;
  createRecipe: (formData: FormData) => void | Promise<void>;
};

export function UrlImportForm({ enabled, libraryQuery, createRecipe }: UrlImportFormProps) {
  const [urlInput, setUrlInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [preview, setPreview] = useState<UrlImportPreview | null>(null);
  const [forceDuplicateSave, setForceDuplicateSave] = useState(false);

  if (!enabled) {
    return null;
  }

  async function onFetchPreview(event: React.FormEvent) {
    event.preventDefault();
    setFetchError(null);
    setBusy(true);
    setForceDuplicateSave(false);
    try {
      const res = await fetch("/api/url-import", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: urlInput.trim() }),
      });
      let data: (UrlImportApiOk & UrlImportApiErr) | null = null;
      try {
        data = (await res.json()) as UrlImportApiOk & UrlImportApiErr;
      } catch {
        setFetchError(`Request failed (${res.status}): invalid response body.`);
        setPreview(null);
        return;
      }
      if (!res.ok) {
        if (data?.fallback && typeof data.fallback.sourceUrl === "string") {
          setPreview({
            name:
              typeof data.fallback.name === "string" && data.fallback.name.trim().length > 0
                ? data.fallback.name
                : "Imported recipe",
            sourceUrl: data.fallback.sourceUrl,
            ingredients: "",
            instructions: "",
            isFallback: true,
            duplicateOf: data.duplicateOf ?? null,
          });
        } else {
          setPreview(null);
        }
        setFetchError(data?.error ?? `Request failed (${res.status})`);
        return;
      }
      if (!data || typeof data.name !== "string" || typeof data.sourceUrl !== "string") {
        setFetchError("Unexpected response from server.");
        setPreview(null);
        return;
      }
      setPreview({
        name: data.name,
        sourceUrl: data.sourceUrl,
        ingredients: Array.isArray(data.ingredients) ? data.ingredients.join("\n") : "",
        instructions: typeof data.instructions === "string" ? data.instructions : "",
        isFallback: false,
        duplicateOf: data.duplicateOf ?? null,
      });
    } catch {
      setFetchError("Network error while fetching the page.");
      setPreview(null);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="mt-8 rounded-md border p-4">
      <h2 className="text-xl font-semibold">Import from URL</h2>
      <p className="mt-1 text-sm text-zinc-600">
        Pages that publish a{" "}
        <span className="font-mono text-xs">schema.org/Recipe</span> block as{" "}
        <span className="font-mono text-xs">application/ld+json</span> can be imported. You review and
        edit before saving; the saved recipe is a normal recipe row (not tied to how the site
        renders later).
      </p>
      <form onSubmit={onFetchPreview} className="mt-4 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
        <div className="grid min-w-0 flex-1 gap-1">
          <label htmlFor="url-import-field" className="text-xs font-medium text-zinc-600 dark:text-zinc-400">
            Recipe page URL
          </label>
          <input
            id="url-import-field"
            type="url"
            name="importUrl"
            value={urlInput}
            onChange={(e) => setUrlInput(e.target.value)}
            placeholder="https://example.com/recipe"
            className="rounded border px-3 py-2 text-sm"
            autoComplete="off"
          />
        </div>
        <button
          type="submit"
          disabled={busy || urlInput.trim().length === 0}
          className="w-fit rounded bg-zinc-800 px-4 py-2 text-sm text-white disabled:opacity-50 dark:bg-zinc-200 dark:text-zinc-900"
        >
          {busy ? "Fetching…" : "Fetch from page"}
        </button>
      </form>
      {fetchError ? (
        <p className="mt-3 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-900 dark:border-red-900 dark:bg-red-950/40 dark:text-red-100">
          {fetchError}
        </p>
      ) : null}
      {preview ? (
        <div className="mt-6 border-t border-zinc-200 pt-6 dark:border-zinc-700">
          <h3 className="text-lg font-semibold">Review before saving</h3>
          <p className="mt-1 text-sm text-zinc-600">
            Fields below are filled from structured data on the page. Adjust anything, then save.
          </p>
          <form key={preview.sourceUrl} action={createRecipe} className="mt-4 grid gap-3">
            <LibraryHiddenFields query={libraryQuery} />
            <input type="hidden" name="sourceUrl" value={preview.sourceUrl} />
            <input
              type="hidden"
              name="allowDuplicateSourceUrl"
              value={forceDuplicateSave ? "1" : "0"}
            />
            {preview.isFallback ? (
              <p className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-100">
                Auto-import is not supported for this URL. We pre-filled what we could so you can
                finish the recipe manually.
              </p>
            ) : null}
            {preview.duplicateOf && !forceDuplicateSave ? (
              <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-100">
                <p className="font-medium">This source URL was already imported.</p>
                <p className="mt-1">
                  Open the existing recipe or continue if you want to save a separate copy.
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <a
                    href={`/dashboard#recipe-${preview.duplicateOf.id}`}
                    className="inline-flex items-center rounded border border-amber-400 px-3 py-1.5 text-sm"
                  >
                    Open existing
                  </a>
                  <button
                    type="button"
                    className="rounded border border-amber-400 px-3 py-1.5 text-sm"
                    onClick={() => setForceDuplicateSave(true)}
                  >
                    Save copy anyway
                  </button>
                </div>
              </div>
            ) : null}
            <input
              name="name"
              required
              defaultValue={preview.name}
              className="rounded border px-3 py-2"
              aria-label="Recipe name"
            />
            <textarea
              name="ingredients"
              rows={6}
              defaultValue={preview.ingredients}
              placeholder="Ingredients (one per line)"
              className="rounded border px-3 py-2"
            />
            <textarea
              name="instructions"
              rows={8}
              defaultValue={preview.instructions}
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
                  <label key={tag} className="flex items-center gap-1.5 text-sm capitalize">
                    <input type="checkbox" name="presetTag" value={tag} className="rounded border" />
                    {tag.replace(/-/g, " ")}
                  </label>
                ))}
              </div>
              <textarea
                name="customTags"
                rows={2}
                placeholder="Custom tags, e.g. italian, kid-friendly"
                className="rounded border px-3 py-2 text-sm"
              />
            </fieldset>
            <div className="flex flex-wrap gap-2">
              <button
                type="submit"
                disabled={Boolean(preview.duplicateOf) && !forceDuplicateSave}
                className="rounded bg-black px-4 py-2 text-white disabled:cursor-not-allowed disabled:opacity-60"
              >
                Save recipe
              </button>
              {preview.duplicateOf && forceDuplicateSave ? (
                <button
                  type="button"
                  className="rounded border px-4 py-2 text-sm"
                  onClick={() => setForceDuplicateSave(false)}
                >
                  Back to duplicate warning
                </button>
              ) : null}
              <button
                type="button"
                className="rounded border px-4 py-2 text-sm"
                onClick={() => {
                  setPreview(null);
                  setFetchError(null);
                  setForceDuplicateSave(false);
                }}
              >
                Discard import
              </button>
            </div>
          </form>
        </div>
      ) : null}
    </section>
  );
}
