-- Issue #4: Shopping lists created from recipes must not use drafts (no usable ingredients).

create or replace function public.recipe_nonblank_ingredient_count(p_ingredients jsonb)
returns integer
language sql
stable
as $$
  select count(*)::integer
  from jsonb_array_elements(coalesce(p_ingredients, '[]'::jsonb)) as elem
  where jsonb_typeof(elem) = 'string'
    and length(trim(elem #>> '{}')) > 0;
$$;

create or replace function public.recipe_has_ingredients(recipe_row public.recipes)
returns boolean
language sql
stable
as $$
  select public.recipe_nonblank_ingredient_count(coalesce(recipe_row.ingredients, '[]'::jsonb)) > 0;
$$;

create table if not exists public.shopping_lists (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  recipe_id uuid not null references public.recipes(id) on delete cascade,
  name text not null check (char_length(name) <= 200),
  created_at timestamptz not null default timezone('utc'::text, now())
);

create or replace function public.shopping_lists_enforce_recipe_has_ingredients()
returns trigger
language plpgsql
as $$
declare
  cnt integer;
begin
  select public.recipe_nonblank_ingredient_count(coalesce(r.ingredients, '[]'::jsonb))
  into cnt
  from public.recipes r
  where r.id = new.recipe_id
    and r.user_id = new.user_id;

  if not found then
    raise exception 'recipe not found for shopping list';
  end if;

  if cnt = 0 then
    raise exception 'draft recipes cannot be used to create shopping lists';
  end if;

  return new;
end;
$$;

drop trigger if exists shopping_lists_enforce_recipe_has_ingredients on public.shopping_lists;
create trigger shopping_lists_enforce_recipe_has_ingredients
before insert or update of recipe_id on public.shopping_lists
for each row
execute procedure public.shopping_lists_enforce_recipe_has_ingredients();

alter table public.shopping_lists enable row level security;

drop policy if exists "shopping_lists_select_own" on public.shopping_lists;
create policy "shopping_lists_select_own"
on public.shopping_lists
for select
to authenticated
using (auth.uid() = user_id);

drop policy if exists "shopping_lists_insert_own" on public.shopping_lists;
create policy "shopping_lists_insert_own"
on public.shopping_lists
for insert
to authenticated
with check (auth.uid() = user_id);

drop policy if exists "shopping_lists_update_own" on public.shopping_lists;
create policy "shopping_lists_update_own"
on public.shopping_lists
for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "shopping_lists_delete_own" on public.shopping_lists;
create policy "shopping_lists_delete_own"
on public.shopping_lists
for delete
to authenticated
using (auth.uid() = user_id);

revoke all on public.shopping_lists from anon;
grant select, insert, update, delete on public.shopping_lists to authenticated;
