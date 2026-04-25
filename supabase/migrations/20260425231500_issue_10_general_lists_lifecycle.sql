-- Issue #10: General shopping lists and list lifecycle management.

alter table public.shopping_lists
  alter column recipe_id drop not null;

create or replace function public.shopping_lists_enforce_recipe_has_ingredients()
returns trigger
language plpgsql
as $$
declare
  cnt integer;
begin
  if new.recipe_id is null then
    return new;
  end if;

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

alter table public.shopping_lists
  add column if not exists status text not null default 'active',
  add column if not exists completed_at timestamptz,
  add column if not exists archived_until timestamptz;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'shopping_lists_status_valid'
  ) then
    alter table public.shopping_lists
      add constraint shopping_lists_status_valid
      check (status in ('active', 'archived'));
  end if;
end;
$$;

alter table public.shopping_list_items
  add column if not exists is_skipped boolean not null default false;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'shopping_list_items_checked_not_skipped'
  ) then
    alter table public.shopping_list_items
      add constraint shopping_list_items_checked_not_skipped
      check (not (is_checked and is_skipped));
  end if;
end;
$$;

create index if not exists shopping_lists_by_user_status_created_at
on public.shopping_lists (user_id, status, created_at desc);

create index if not exists shopping_lists_archived_until
on public.shopping_lists (archived_until)
where status = 'archived';
