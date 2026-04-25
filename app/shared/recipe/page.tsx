import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

import { SafeText } from "@/components/safe-text";
import { resolveSharedRecipeByToken } from "@/lib/recipe-sharing";
import { createServerSupabaseClient } from "@/lib/supabase/server";

type SharedRecipePageProps = {
  searchParams: Promise<{ token?: string; message?: string }>;
};

export default async function SharedRecipePage({ searchParams }: SharedRecipePageProps) {
  const query = await searchParams;
  const token = typeof query.token === "string" ? query.token.trim() : "";
  const message = typeof query.message === "string" ? query.message : "";

  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    const nextPath = token ? `/shared/recipe?token=${encodeURIComponent(token)}` : "/shared/recipe";
    redirect(`/login?message=${encodeURIComponent("Sign in to open shared recipes.")}&next=${encodeURIComponent(nextPath)}`);
  }

  async function saveSharedCopy(formData: FormData) {
    "use server";

    const authClient = await createServerSupabaseClient();
    const {
      data: { user: authUser },
    } = await authClient.auth.getUser();
    if (!authUser) {
      redirect("/login");
    }

    const formToken = String(formData.get("token") ?? "").trim();
    if (!formToken) {
      redirect("/shared/recipe?message=Missing+token");
    }

    const shared = await resolveSharedRecipeByToken(formToken);
    if (!shared) {
      redirect("/shared/recipe?message=Share+link+is+invalid+or+revoked");
    }

    const copyName = `${shared.recipe.name} (Shared copy)`.slice(0, 160);
    const now = new Date().toISOString();
    const { error } = await authClient.from("recipes").insert({
      user_id: authUser.id,
      name: copyName,
      source_url: shared.recipe.source_url,
      instructions: shared.recipe.instructions,
      ingredients: Array.isArray(shared.recipe.ingredients) ? shared.recipe.ingredients : [],
      tags: Array.isArray(shared.recipe.tags) ? shared.recipe.tags : [],
      updated_at: now,
    });

    if (error) {
      redirect(`/shared/recipe?token=${encodeURIComponent(formToken)}&message=${encodeURIComponent(error.message)}`);
    }

    revalidatePath("/dashboard");
    redirect(`/dashboard?message=${encodeURIComponent("Shared recipe saved to your library.")}`);
  }

  if (!token) {
    return (
      <main className="mx-auto flex min-h-screen w-full max-w-2xl flex-col px-6 py-12">
        <h1 className="text-3xl font-semibold">Shared recipe</h1>
        <p className="mt-4 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950">
          Missing token. Open a full share link from the recipe owner.
        </p>
      </main>
    );
  }

  const shared = await resolveSharedRecipeByToken(token);
  if (!shared) {
    return (
      <main className="mx-auto flex min-h-screen w-full max-w-2xl flex-col px-6 py-12">
        <h1 className="text-3xl font-semibold">Shared recipe</h1>
        <p className="mt-4 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950">
          This share link is invalid or has been revoked.
        </p>
      </main>
    );
  }

  const ingredientLines = Array.isArray(shared.recipe.ingredients)
    ? shared.recipe.ingredients
        .map((value) => (typeof value === "string" ? value.trim() : ""))
        .filter((value) => value.length > 0)
    : [];

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-2xl flex-col px-6 py-12">
      <h1 className="text-3xl font-semibold">Shared recipe</h1>
      {message ? (
        <p className="mt-4 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950">
          <SafeText value={message} />
        </p>
      ) : null}
      <article className="mt-6 rounded-md border p-4">
        <h2 className="text-xl font-semibold">
          <SafeText value={shared.recipe.name ?? "Untitled recipe"} />
        </h2>
        {shared.recipe.source_url ? (
          <p className="mt-2 break-all text-sm text-zinc-600">
            Source:{" "}
            <a className="underline" href={shared.recipe.source_url}>
              <SafeText value={shared.recipe.source_url} />
            </a>
          </p>
        ) : null}
        <h3 className="mt-5 text-sm font-medium text-zinc-700">Ingredients</h3>
        {ingredientLines.length === 0 ? (
          <p className="mt-1 text-sm text-zinc-600">No ingredients listed.</p>
        ) : (
          <ul className="mt-2 list-disc space-y-1 pl-6 text-sm">
            {ingredientLines.map((line, idx) => (
              <li key={`${idx}-${line}`}>
                <SafeText value={line} />
              </li>
            ))}
          </ul>
        )}
        <h3 className="mt-5 text-sm font-medium text-zinc-700">Instructions</h3>
        <p className="mt-1 whitespace-pre-wrap text-sm text-zinc-800">
          <SafeText value={shared.recipe.instructions ?? "No instructions provided."} />
        </p>
      </article>
      <form action={saveSharedCopy} className="mt-4">
        <input type="hidden" name="token" value={token} />
        <button type="submit" className="rounded bg-black px-4 py-2 text-sm text-white">
          Save as my own copy
        </button>
      </form>
    </main>
  );
}
