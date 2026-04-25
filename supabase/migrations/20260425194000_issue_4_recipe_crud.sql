-- Issue #4: Recipe CRUD with draft support.
-- Drafts are represented by recipes with no ingredients.

alter table public.recipes
  add column if not exists ingredients jsonb not null default '[]'::jsonb;

alter table public.recipes
  add column if not exists instructions text;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'recipes_ingredients_is_array'
  ) then
    alter table public.recipes
      add constraint recipes_ingredients_is_array
      check (jsonb_typeof(ingredients) = 'array');
  end if;
end;
$$;

create or replace function public.recipe_has_ingredients(recipe_row public.recipes)
returns boolean
language sql
stable
as $$
  select jsonb_array_length(coalesce(recipe_row.ingredients, '[]'::jsonb)) > 0;
$$;
