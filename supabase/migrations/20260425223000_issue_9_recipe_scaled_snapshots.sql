-- Issue #9: Recipe-based shopping lists with scaling and immutable ingredient snapshots.

alter table public.shopping_lists
  add column if not exists scale numeric(8, 3) not null default 1.0;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'shopping_lists_scale_positive'
  ) then
    alter table public.shopping_lists
      add constraint shopping_lists_scale_positive
      check (scale > 0);
  end if;
end;
$$;

create table if not exists public.shopping_list_items (
  id uuid primary key default gen_random_uuid(),
  shopping_list_id uuid not null references public.shopping_lists(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  item_text text not null check (char_length(trim(item_text)) > 0),
  position integer not null check (position >= 0),
  is_checked boolean not null default false,
  source_recipe_id uuid references public.recipes(id) on delete set null,
  created_at timestamptz not null default timezone('utc'::text, now()),
  unique (shopping_list_id, position)
);

create index if not exists shopping_list_items_by_list_position
on public.shopping_list_items (shopping_list_id, position);

alter table public.shopping_list_items enable row level security;

drop policy if exists "shopping_list_items_select_own" on public.shopping_list_items;
create policy "shopping_list_items_select_own"
on public.shopping_list_items
for select
to authenticated
using (auth.uid() = user_id);

drop policy if exists "shopping_list_items_insert_own" on public.shopping_list_items;
create policy "shopping_list_items_insert_own"
on public.shopping_list_items
for insert
to authenticated
with check (auth.uid() = user_id);

drop policy if exists "shopping_list_items_update_own" on public.shopping_list_items;
create policy "shopping_list_items_update_own"
on public.shopping_list_items
for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "shopping_list_items_delete_own" on public.shopping_list_items;
create policy "shopping_list_items_delete_own"
on public.shopping_list_items
for delete
to authenticated
using (auth.uid() = user_id);

revoke all on public.shopping_list_items from anon;
grant select, insert, update, delete on public.shopping_list_items to authenticated;
