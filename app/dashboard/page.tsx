import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

import { SafeText } from "@/components/safe-text";
import { OfflineShoppingItemToggle } from "@/components/offline-shopping-item-toggle";
import { RecipeShareControls } from "./recipe-share-controls";
import { RecipeDraftForm } from "./recipe-draft-form";
import { UrlImportForm } from "./url-import-form";
import { getFeatureFlags } from "@/lib/feature-flags";
import { recipeHasNonblankIngredients } from "@/lib/recipe-ingredients";
import { buildShoppingListItemRows } from "@/lib/shopping-list-items";
import { mergeRecipeTags, parseTagsFromRow, RECIPE_PREDEFINED_TAGS } from "@/lib/recipe-tags";
import { createServerSupabaseClient } from "@/lib/supabase/server";

const ARCHIVE_RETENTION_DAYS = 30;

function parseIngredients(value: string) {
  return value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

function parseShoppingListItems(value: string) {
  return value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

type DashboardPageProps = {
  searchParams: Promise<{ message?: string; q?: string; favorites?: string; tag?: string }>;
};

function sanitizeNameSearchFragment(raw: string): string {
  return raw.trim().replace(/[%_\\]/g, "");
}

function applyLibraryFromFormData(formData: FormData, params: URLSearchParams) {
  const q = String(formData.get("lib_q") ?? "").trim();
  if (q) {
    params.set("q", q);
  }
  if (String(formData.get("lib_favorites") ?? "") === "1") {
    params.set("favorites", "1");
  }
  const tag = String(formData.get("lib_tag") ?? "").trim();
  if (tag) {
    params.set("tag", tag);
  }
}

function dashboardRedirect(formData: FormData, notice?: string): string {
  const params = new URLSearchParams();
  applyLibraryFromFormData(formData, params);
  if (notice) {
    params.set("message", notice);
  }
  const s = params.toString();
  return s ? `/dashboard?${s}` : "/dashboard";
}

function LibraryPersistFields({
  query,
}: {
  query: { q?: string; favorites?: string; tag?: string };
}) {
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

export default async function DashboardPage({ searchParams }: DashboardPageProps) {
  const query = await searchParams;
  let notice: string | undefined;
  if (typeof query.message === "string") {
    try {
      notice = decodeURIComponent(query.message);
    } catch {
      notice = query.message;
    }
  }

  const supabase = await createServerSupabaseClient();
  const featureFlags = await getFeatureFlags();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const searchName = typeof query.q === "string" ? sanitizeNameSearchFragment(query.q) : "";
  const favoritesOnly = query.favorites === "1";
  const filterTag = typeof query.tag === "string" ? query.tag.trim() : "";

  let recipesQuery = supabase
    .from("recipes")
    .select("id, name, source_url, instructions, ingredients, tags, is_favorite, created_at")
    .order("created_at", { ascending: false });

  if (searchName) {
    recipesQuery = recipesQuery.ilike("name", `%${searchName}%`);
  }
  if (favoritesOnly) {
    recipesQuery = recipesQuery.eq("is_favorite", true);
  }
  if (filterTag) {
    recipesQuery = recipesQuery.contains("tags", [filterTag]);
  }

  const { data: recipes } = await recipesQuery;
  const { data: shareLinks } = await supabase
    .from("recipe_share_links")
    .select("recipe_id, token_hash, revoked_at")
    .eq("owner_user_id", user.id);
  const recipesWithActiveShareLinks = new Set(
    (shareLinks ?? [])
      .filter((row) => typeof row.token_hash === "string" && row.token_hash.length > 0 && !row.revoked_at)
      .map((row) => row.recipe_id),
  );

  const { data: tagSourceRows } = await supabase.from("recipes").select("tags");
  const tagFilterOptions = new Set<string>([...RECIPE_PREDEFINED_TAGS]);
  for (const row of tagSourceRows ?? []) {
    for (const t of parseTagsFromRow(row.tags)) {
      tagFilterOptions.add(t);
    }
  }
  const sortedTagFilterOptions = [...tagFilterOptions].sort((a, b) =>
    a.localeCompare(b, undefined, { sensitivity: "base" }),
  );

  await supabase
    .from("shopping_lists")
    .delete()
    .eq("user_id", user.id)
    .eq("status", "archived")
    .lt("archived_until", new Date().toISOString());

  const { data: shoppingLists } = await supabase
    .from("shopping_lists")
    .select(
      "id, name, scale, status, created_at, completed_at, archived_until, recipes(name), shopping_list_items(id, item_text, position, is_checked, is_skipped)",
    )
    .order("created_at", { ascending: false });

  const activeShoppingLists = (shoppingLists ?? []).filter((row) => row.status === "active");
  const archivedShoppingLists = (shoppingLists ?? []).filter((row) => row.status === "archived");

  async function createRecipe(formData: FormData) {
    "use server";

    const authClient = await createServerSupabaseClient();
    const {
      data: { user: authUser },
    } = await authClient.auth.getUser();

    if (!authUser) {
      redirect("/login");
    }

    const name = String(formData.get("name") ?? "").trim();
    const sourceUrlRaw = String(formData.get("sourceUrl") ?? "").trim();
    const allowDuplicateSourceUrl = String(formData.get("allowDuplicateSourceUrl") ?? "") === "1";
    const instructionsRaw = String(formData.get("instructions") ?? "").trim();
    const ingredientsRaw = String(formData.get("ingredients") ?? "");
    const presetTags = formData.getAll("presetTag").map((v) => String(v));
    const customTagsRaw = String(formData.get("customTags") ?? "");
    const tags = mergeRecipeTags(presetTags, customTagsRaw);

    if (!name) {
      redirect(dashboardRedirect(formData, "Recipe name is required."));
    }

    if (sourceUrlRaw && !allowDuplicateSourceUrl) {
      const { data: existing } = await authClient
        .from("recipes")
        .select("id, name")
        .eq("user_id", authUser.id)
        .eq("source_url", sourceUrlRaw)
        .limit(1)
        .maybeSingle();

      if (existing) {
        redirect(
          dashboardRedirect(
            formData,
            `This source URL is already in your library as "${existing.name ?? "Untitled recipe"}". Open it or choose "Save copy anyway" in import.`,
          ),
        );
      }
    }

    const ingredients = parseIngredients(ingredientsRaw);

    await authClient.from("recipes").insert({
      user_id: authUser.id,
      name,
      source_url: sourceUrlRaw || null,
      instructions: instructionsRaw || null,
      ingredients,
      tags,
    });

    revalidatePath("/dashboard");
  }

  async function updateRecipe(formData: FormData) {
    "use server";

    const authClient = await createServerSupabaseClient();
    const {
      data: { user: authUser },
    } = await authClient.auth.getUser();

    if (!authUser) {
      redirect("/login");
    }

    const recipeId = String(formData.get("recipeId") ?? "");
    const name = String(formData.get("name") ?? "").trim();
    const sourceUrlRaw = String(formData.get("sourceUrl") ?? "").trim();
    const instructionsRaw = String(formData.get("instructions") ?? "").trim();
    const ingredientsRaw = String(formData.get("ingredients") ?? "");
    const presetTags = formData.getAll("presetTag").map((v) => String(v));
    const customTagsRaw = String(formData.get("customTags") ?? "");
    const tags = mergeRecipeTags(presetTags, customTagsRaw);

    if (!recipeId || !name) {
      redirect(dashboardRedirect(formData, "Recipe update is missing required fields."));
    }

    const ingredients = parseIngredients(ingredientsRaw);

    await authClient
      .from("recipes")
      .update({
        name,
        source_url: sourceUrlRaw || null,
        instructions: instructionsRaw || null,
        ingredients,
        tags,
        updated_at: new Date().toISOString(),
      })
      .eq("id", recipeId)
      .eq("user_id", authUser.id);

    revalidatePath("/dashboard");
  }

  async function deleteRecipe(formData: FormData) {
    "use server";

    const authClient = await createServerSupabaseClient();
    const {
      data: { user: authUser },
    } = await authClient.auth.getUser();

    if (!authUser) {
      redirect("/login");
    }

    const recipeId = String(formData.get("recipeId") ?? "");
    if (!recipeId) {
      redirect(dashboardRedirect(formData, "Recipe id is required for delete."));
    }

    await authClient.from("recipes").delete().eq("id", recipeId).eq("user_id", authUser.id);
    revalidatePath("/dashboard");
  }

  async function toggleRecipeFavorite(formData: FormData) {
    "use server";

    const authClient = await createServerSupabaseClient();
    const {
      data: { user: authUser },
    } = await authClient.auth.getUser();

    if (!authUser) {
      redirect("/login");
    }

    const recipeId = String(formData.get("recipeId") ?? "");
    if (!recipeId) {
      redirect(dashboardRedirect(formData, "Recipe id is required."));
    }

    const { data: row, error: readError } = await authClient
      .from("recipes")
      .select("is_favorite")
      .eq("id", recipeId)
      .eq("user_id", authUser.id)
      .maybeSingle();

    if (readError || !row) {
      redirect(dashboardRedirect(formData, "Recipe not found."));
    }

    await authClient
      .from("recipes")
      .update({
        is_favorite: !row.is_favorite,
        updated_at: new Date().toISOString(),
      })
      .eq("id", recipeId)
      .eq("user_id", authUser.id);

    redirect(dashboardRedirect(formData));
  }

  async function createShoppingListFromRecipe(formData: FormData) {
    "use server";

    const authClient = await createServerSupabaseClient();
    const {
      data: { user: authUser },
    } = await authClient.auth.getUser();

    if (!authUser) {
      redirect("/login");
    }

    const recipeId = String(formData.get("recipeId") ?? "").trim();
    const scaleRaw = Number(formData.get("scale") ?? "1");
    const scale = Number.isFinite(scaleRaw) && scaleRaw > 0 ? Math.round(scaleRaw * 1000) / 1000 : NaN;
    if (!recipeId) {
      redirect(dashboardRedirect(formData, "Recipe is required to create a list."));
    }
    if (!Number.isFinite(scale)) {
      redirect(dashboardRedirect(formData, "Scale must be a positive number."));
    }

    const { data: recipe, error: recipeError } = await authClient
      .from("recipes")
      .select("id, name, ingredients, user_id")
      .eq("id", recipeId)
      .eq("user_id", authUser.id)
      .maybeSingle();

    if (recipeError || !recipe) {
      redirect(dashboardRedirect(formData, "Recipe not found."));
    }

    if (!recipeHasNonblankIngredients(recipe.ingredients)) {
      redirect(
        dashboardRedirect(formData, "Add at least one ingredient before creating a shopping list."),
      );
    }

    const listName = `Shopping: ${recipe.name ?? "Recipe"}`.slice(0, 200);

    const { data: listRow, error: insertError } = await authClient
      .from("shopping_lists")
      .insert({
        user_id: authUser.id,
        recipe_id: recipe.id,
        name: listName,
        scale,
      })
      .select("id")
      .single();

    if (insertError || !listRow) {
      redirect(dashboardRedirect(formData, insertError?.message ?? "Failed to create shopping list."));
    }

    const itemRows = buildShoppingListItemRows(
      recipe.ingredients,
      scale,
      listRow.id,
      authUser.id,
      recipe.id,
    );

    const { error: itemInsertError } = await authClient.from("shopping_list_items").insert(itemRows);
    if (itemInsertError) {
      await authClient.from("shopping_lists").delete().eq("id", listRow.id).eq("user_id", authUser.id);
      redirect(dashboardRedirect(formData, itemInsertError.message));
    }

    revalidatePath("/dashboard");
  }

  async function createGeneralShoppingList(formData: FormData) {
    "use server";

    const authClient = await createServerSupabaseClient();
    const {
      data: { user: authUser },
    } = await authClient.auth.getUser();

    if (!authUser) {
      redirect("/login");
    }

    const listName = String(formData.get("name") ?? "").trim();
    const rawItems = String(formData.get("items") ?? "");
    const items = parseShoppingListItems(rawItems);

    if (!listName) {
      redirect(dashboardRedirect(formData, "List name is required."));
    }
    if (items.length === 0) {
      redirect(dashboardRedirect(formData, "Add at least one list item."));
    }

    const { data: listRow, error: listInsertError } = await authClient
      .from("shopping_lists")
      .insert({
        user_id: authUser.id,
        recipe_id: null,
        name: listName.slice(0, 200),
      })
      .select("id")
      .single();

    if (listInsertError || !listRow) {
      redirect(dashboardRedirect(formData, listInsertError?.message ?? "Failed to create list."));
    }

    const itemRows = items.map((item, index) => ({
      shopping_list_id: listRow.id,
      user_id: authUser.id,
      item_text: item,
      position: index,
      source_recipe_id: null,
    }));

    const { error: itemInsertError } = await authClient.from("shopping_list_items").insert(itemRows);
    if (itemInsertError) {
      await authClient.from("shopping_lists").delete().eq("id", listRow.id).eq("user_id", authUser.id);
      redirect(dashboardRedirect(formData, itemInsertError.message));
    }

    revalidatePath("/dashboard");
  }

  async function archiveShoppingList(formData: FormData) {
    "use server";

    const authClient = await createServerSupabaseClient();
    const {
      data: { user: authUser },
    } = await authClient.auth.getUser();

    if (!authUser) {
      redirect("/login");
    }

    const listId = String(formData.get("listId") ?? "").trim();
    const skipRemaining = String(formData.get("skipRemaining") ?? "") === "1";
    if (!listId) {
      redirect(dashboardRedirect(formData, "List id is required."));
    }

    if (skipRemaining) {
      await authClient
        .from("shopping_list_items")
        .update({ is_skipped: true, is_checked: false })
        .eq("shopping_list_id", listId)
        .eq("user_id", authUser.id)
        .eq("is_checked", false);
    }

    const now = new Date();
    const archivedUntil = new Date(now.getTime() + ARCHIVE_RETENTION_DAYS * 24 * 60 * 60 * 1000);

    await authClient
      .from("shopping_lists")
      .update({
        status: "archived",
        completed_at: now.toISOString(),
        archived_until: archivedUntil.toISOString(),
      })
      .eq("id", listId)
      .eq("user_id", authUser.id);

    revalidatePath("/dashboard");
  }

  async function deleteShoppingList(formData: FormData) {
    "use server";

    const authClient = await createServerSupabaseClient();
    const {
      data: { user: authUser },
    } = await authClient.auth.getUser();

    if (!authUser) {
      redirect("/login");
    }

    const listId = String(formData.get("listId") ?? "").trim();
    if (!listId) {
      redirect(dashboardRedirect(formData, "List id is required."));
    }

    await authClient.from("shopping_lists").delete().eq("id", listId).eq("user_id", authUser.id);
    revalidatePath("/dashboard");
  }

  async function signOut() {
    "use server";

    const authClient = await createServerSupabaseClient();
    await authClient.auth.signOut();
    redirect("/login?message=You have been signed out.");
  }

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-2xl flex-col px-6 py-12">
      <h1 className="text-3xl font-semibold">Dashboard</h1>
      <p className="mt-3 text-sm text-zinc-600">
        Signed in as <SafeText value={user.email ?? "unknown-user"} />
      </p>
      {notice ? (
        <p className="mt-4 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-100">
          <SafeText value={notice} />
        </p>
      ) : null}
      <p className="mt-8 rounded-md bg-zinc-100 p-4 text-sm dark:bg-zinc-800">
        Protected page access is active. Unauthenticated users are redirected to sign in.
      </p>
      <div className="mt-4 rounded-md bg-zinc-100 p-4 text-sm dark:bg-zinc-800">
        <p className="font-medium">Runtime feature flags</p>
        <p className="mt-2">URL import: {featureFlags.url_import ? "enabled" : "disabled"}</p>
        <p>Recipe sharing: {featureFlags.recipe_sharing ? "enabled" : "disabled"}</p>
      </div>
      <UrlImportForm
        enabled={featureFlags.url_import}
        libraryQuery={query}
        createRecipe={createRecipe}
      />
      <section className="mt-8 rounded-md border p-4">
        <h2 className="text-xl font-semibold">Create recipe</h2>
        <p className="mt-1 text-sm text-zinc-600">
          Drafts are valid with just a name. Add ingredients when ready.
        </p>
        <div className="mt-4">
          <RecipeDraftForm
            mode="create"
            libraryQuery={query}
            action={createRecipe}
            submitLabel="Save recipe"
            initialValues={{
              name: "",
              sourceUrl: "",
              ingredients: "",
              instructions: "",
              presetTags: [],
              customTags: "",
            }}
          />
        </div>
      </section>
      <section className="mt-8">
        <h2 className="text-xl font-semibold">Shopping lists</h2>
        <p className="mt-1 text-sm text-zinc-600">
          Create general lists or recipe-based lists. Complete any active list and optionally skip the
          remaining unchecked items.
        </p>
        <form action={createGeneralShoppingList} className="mt-4 grid gap-3 rounded-md border p-4">
          <LibraryPersistFields query={query} />
          <input
            name="name"
            required
            maxLength={200}
            placeholder="General list name (e.g. Weekly groceries)"
            className="rounded border px-3 py-2"
          />
          <textarea
            name="items"
            rows={4}
            placeholder={"List items (one per line)\nExample: Bananas"}
            className="rounded border px-3 py-2"
          />
          <button className="w-fit rounded border px-4 py-2 text-sm" type="submit">
            Create general list
          </button>
        </form>
        <h3 className="mt-6 text-lg font-semibold">Active</h3>
        <ul className="mt-3 space-y-2">
          {activeShoppingLists.map((row) => {
            const recipeName =
              row.recipes && typeof row.recipes === "object" && row.recipes !== null && "name" in row.recipes
                ? String((row.recipes as { name: string | null }).name ?? "")
                : "";

            return (
              <li key={row.id} className="rounded-md border px-3 py-3 text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">
                    <SafeText value={row.name ?? "List"} />
                  </span>
                  {recipeName ? (
                    <span className="text-zinc-600">
                      · recipe <SafeText value={recipeName} />
                    </span>
                  ) : (
                    <span className="text-zinc-600">· general</span>
                  )}
                  {typeof row.scale === "number" ? (
                    <span className="text-zinc-600">· scale {row.scale}x</span>
                  ) : null}
                </div>
                <ul className="mt-2 space-y-1">
                  {Array.isArray(row.shopping_list_items) &&
                    [...row.shopping_list_items]
                      .sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
                      .map((item) => (
                        <li key={item.id} className="text-zinc-700">
                          <OfflineShoppingItemToggle
                            itemId={item.id}
                            initialChecked={Boolean(item.is_checked)}
                            initialSkipped={Boolean(item.is_skipped)}
                            itemText={typeof item.item_text === "string" ? item.item_text : ""}
                          />
                        </li>
                      ))}
                </ul>
                <div className="mt-3 flex flex-wrap items-center gap-3">
                  <form action={archiveShoppingList} className="flex flex-wrap items-center gap-2">
                    <LibraryPersistFields query={query} />
                    <input type="hidden" name="listId" value={row.id} />
                    <label className="flex items-center gap-1.5 text-xs text-zinc-600">
                      <input type="checkbox" name="skipRemaining" value="1" className="rounded border" />
                      Skip remaining unchecked items
                    </label>
                    <button type="submit" className="rounded border px-3 py-1.5 text-sm">
                      Mark done
                    </button>
                  </form>
                  <form action={deleteShoppingList}>
                    <LibraryPersistFields query={query} />
                    <input type="hidden" name="listId" value={row.id} />
                    <button type="submit" className="rounded border px-3 py-1.5 text-sm">
                      Delete
                    </button>
                  </form>
                </div>
              </li>
            );
          })}
        </ul>
        {activeShoppingLists.length === 0 ? (
          <p className="mt-2 rounded-md bg-zinc-100 p-3 text-sm dark:bg-zinc-800">
            No active lists. Create a general list above or generate one from a recipe.
          </p>
        ) : null}
        <h3 className="mt-6 text-lg font-semibold">Archive</h3>
        <ul className="mt-3 space-y-2">
          {archivedShoppingLists.map((row) => (
            <li key={row.id} className="rounded-md border px-3 py-3 text-sm">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium">
                  <SafeText value={row.name ?? "List"} />
                </span>
                {row.completed_at ? (
                  <span className="text-zinc-600">
                    · completed {new Date(row.completed_at).toLocaleDateString()}
                  </span>
                ) : null}
                {row.archived_until ? (
                  <span className="text-zinc-600">
                    · auto-delete {new Date(row.archived_until).toLocaleDateString()}
                  </span>
                ) : null}
              </div>
              <form action={deleteShoppingList} className="mt-2">
                <LibraryPersistFields query={query} />
                <input type="hidden" name="listId" value={row.id} />
                <button type="submit" className="rounded border px-3 py-1.5 text-sm">
                  Delete now
                </button>
              </form>
            </li>
          ))}
        </ul>
        {archivedShoppingLists.length === 0 ? (
          <p className="mt-2 rounded-md bg-zinc-100 p-3 text-sm dark:bg-zinc-800">
            No archived lists yet. Completed lists are kept for {ARCHIVE_RETENTION_DAYS} days.
          </p>
        ) : null}
      </section>
      <section className="mt-8">
        <h2 className="text-xl font-semibold">Your recipes</h2>
        <form method="get" className="mt-4 flex flex-col gap-3 rounded-md border border-zinc-200 p-4 dark:border-zinc-700 sm:flex-row sm:flex-wrap sm:items-end">
          <div className="grid flex-1 gap-1 sm:min-w-[12rem]">
            <label htmlFor="recipe-search-q" className="text-xs font-medium text-zinc-600 dark:text-zinc-400">
              Search by name
            </label>
            <input
              id="recipe-search-q"
              name="q"
              defaultValue={typeof query.q === "string" ? query.q : ""}
              placeholder="e.g. lasagna"
              className="rounded border px-3 py-2 text-sm"
            />
          </div>
          <div className="flex flex-wrap items-center gap-4">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                name="favorites"
                value="1"
                defaultChecked={query.favorites === "1"}
                className="rounded border"
              />
              Favorites only
            </label>
            <div className="grid gap-1">
              <label htmlFor="recipe-filter-tag" className="text-xs font-medium text-zinc-600 dark:text-zinc-400">
                Tag
              </label>
              <select
                id="recipe-filter-tag"
                name="tag"
                defaultValue={filterTag}
                className="rounded border px-3 py-2 text-sm capitalize"
              >
                <option value="">All tags</option>
                {sortedTagFilterOptions.map((t) => (
                  <option key={t} value={t}>
                    {t.replace(/-/g, " ")}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="submit" className="rounded bg-black px-4 py-2 text-sm text-white">
              Apply filters
            </button>
            <a
              href="/dashboard"
              className="inline-flex items-center rounded border px-4 py-2 text-sm text-zinc-700 dark:text-zinc-200"
            >
              Clear
            </a>
          </div>
        </form>
        <div className="mt-4 space-y-4">
          {(recipes ?? []).map((recipe) => {
            const ingredientLines = Array.isArray(recipe.ingredients)
              ? recipe.ingredients
                  .map((value) => (typeof value === "string" ? value : ""))
                  .filter((value) => value.length > 0)
              : [];
            const isDraft = !recipeHasNonblankIngredients(recipe.ingredients);
            const recipeTags = parseTagsFromRow(recipe.tags);
            const customTagLines = recipeTags
              .filter(
                (t) =>
                  !RECIPE_PREDEFINED_TAGS.some((p) => p.toLowerCase() === t.toLowerCase()),
              )
              .join(", ");
            const isFavorite = Boolean(recipe.is_favorite);
            const hasActiveShareLink = recipesWithActiveShareLinks.has(recipe.id);

            return (
              <article id={`recipe-${recipe.id}`} key={recipe.id} className="rounded-md border p-4">
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm text-zinc-500">
                    Status: {isDraft ? "Draft (name-only)" : "Ready for shopping lists"}
                  </p>
                  <div className="flex flex-wrap items-center gap-2">
                    <form action={toggleRecipeFavorite}>
                      <LibraryPersistFields query={query} />
                      <input type="hidden" name="recipeId" value={recipe.id} />
                      <button
                        type="submit"
                        className="rounded border px-3 py-1 text-sm"
                        aria-pressed={isFavorite}
                      >
                        {isFavorite ? "★ Favorited" : "☆ Add to favorites"}
                      </button>
                    </form>
                    <form action={deleteRecipe}>
                      <LibraryPersistFields query={query} />
                      <input type="hidden" name="recipeId" value={recipe.id} />
                      <button type="submit" className="rounded border px-3 py-1 text-sm">
                        Delete
                      </button>
                    </form>
                  </div>
                </div>
                {recipeTags.length > 0 ? (
                  <ul className="mb-3 flex flex-wrap gap-1.5">
                    {recipeTags.map((t) => (
                      <li
                        key={`${recipe.id}-${t}`}
                        className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs capitalize text-zinc-800 dark:bg-zinc-800 dark:text-zinc-100"
                      >
                        <SafeText value={t.replace(/-/g, " ")} />
                      </li>
                    ))}
                  </ul>
                ) : null}
                <RecipeDraftForm
                  mode="edit"
                  recipeId={recipe.id}
                  libraryQuery={query}
                  action={updateRecipe}
                  submitLabel="Update recipe"
                  initialValues={{
                    name: recipe.name ?? "",
                    sourceUrl: recipe.source_url ?? "",
                    ingredients: ingredientLines.join("\n"),
                    instructions: recipe.instructions ?? "",
                    presetTags: recipeTags.filter((rt) =>
                      RECIPE_PREDEFINED_TAGS.some((tag) => tag.toLowerCase() === rt.toLowerCase()),
                    ),
                    customTags: customTagLines,
                  }}
                />
                {isDraft ? (
                  <p className="mt-3 text-sm text-zinc-500">
                    Add ingredients to create a shopping list from this recipe.
                  </p>
                ) : (
                  <form action={createShoppingListFromRecipe} className="mt-3">
                    <LibraryPersistFields query={query} />
                    <input type="hidden" name="recipeId" value={recipe.id} />
                    <div className="mb-2 flex items-center gap-2">
                      <label htmlFor={`scale-${recipe.id}`} className="text-sm text-zinc-600">
                        Scale
                      </label>
                      <input
                        id={`scale-${recipe.id}`}
                        name="scale"
                        type="number"
                        min="0.1"
                        step="0.25"
                        defaultValue="1"
                        className="w-24 rounded border px-2 py-1 text-sm"
                      />
                    </div>
                    <button type="submit" className="rounded border px-3 py-2 text-sm">
                      Create shopping list from recipe
                    </button>
                  </form>
                )}
                <RecipeShareControls recipeId={recipe.id} hasActiveShareLink={hasActiveShareLink} />
              </article>
            );
          })}
          {recipes?.length === 0 ? (
            <p className="rounded-md bg-zinc-100 p-3 text-sm dark:bg-zinc-800">
              No recipes yet. Create your first draft above.
            </p>
          ) : null}
        </div>
      </section>
      <form action={signOut} className="mt-6">
        <button className="rounded bg-black px-4 py-2 text-white" type="submit">
          Sign out
        </button>
      </form>
    </main>
  );
}
