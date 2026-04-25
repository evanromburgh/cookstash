"use client";

import { useState } from "react";

type RecipeShareControlsProps = {
  recipeId: string;
  hasActiveShareLink: boolean;
};

type ShareApiResponse = {
  error?: string;
  shareUrl?: string;
};

export function RecipeShareControls({ recipeId, hasActiveShareLink }: RecipeShareControlsProps) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [active, setActive] = useState(hasActiveShareLink);

  async function callShareAction(action: "create" | "regenerate" | "revoke") {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/share", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, recipeId }),
      });
      let data: ShareApiResponse | null = null;
      try {
        data = (await res.json()) as ShareApiResponse;
      } catch {
        setError(`Request failed (${res.status})`);
        return;
      }
      if (!res.ok) {
        setError(data?.error ?? `Request failed (${res.status})`);
        return;
      }
      if (action === "revoke") {
        setActive(false);
        setShareUrl(null);
      } else {
        setActive(true);
        setShareUrl(typeof data?.shareUrl === "string" ? data.shareUrl : null);
      }
    } catch {
      setError("Network error while updating share link.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-3 rounded-md border border-zinc-200 p-3 text-sm dark:border-zinc-700">
      <p className="font-medium">Recipe sharing</p>
      <p className="mt-1 text-zinc-600 dark:text-zinc-300">
        {active
          ? "An active link exists. Regenerate to get a fresh URL, or revoke immediately."
          : "Create a signed-in share link for this recipe."}
      </p>
      {shareUrl ? (
        <p className="mt-2 break-all">
          Latest link:{" "}
          <a href={shareUrl} className="underline">
            {shareUrl}
          </a>
        </p>
      ) : null}
      {error ? <p className="mt-2 text-red-700 dark:text-red-300">{error}</p> : null}
      <div className="mt-3 flex flex-wrap gap-2">
        {!active ? (
          <button
            type="button"
            className="rounded border px-3 py-1.5"
            disabled={busy}
            onClick={() => callShareAction("create")}
          >
            Create share link
          </button>
        ) : (
          <>
            <button
              type="button"
              className="rounded border px-3 py-1.5"
              disabled={busy}
              onClick={() => callShareAction("regenerate")}
            >
              Regenerate link
            </button>
            <button
              type="button"
              className="rounded border px-3 py-1.5"
              disabled={busy}
              onClick={() => callShareAction("revoke")}
            >
              Revoke link
            </button>
          </>
        )}
      </div>
    </div>
  );
}
