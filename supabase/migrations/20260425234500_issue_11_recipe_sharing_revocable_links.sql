-- Issue #11: authenticated, revocable recipe sharing links.

create table if not exists public.recipe_share_links (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  recipe_id uuid not null references public.recipes(id) on delete cascade,
  token_hash text unique,
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now()),
  revoked_at timestamptz
);

create unique index if not exists recipe_share_links_recipe_unique
on public.recipe_share_links (recipe_id);

create index if not exists recipe_share_links_owner_idx
on public.recipe_share_links (owner_user_id, recipe_id);

create index if not exists recipe_share_links_token_hash_idx
on public.recipe_share_links (token_hash)
where token_hash is not null;

alter table public.recipe_share_links enable row level security;

drop policy if exists "recipe_share_links_select_own" on public.recipe_share_links;
create policy "recipe_share_links_select_own"
on public.recipe_share_links
for select
to authenticated
using (auth.uid() = owner_user_id);

drop policy if exists "recipe_share_links_insert_own" on public.recipe_share_links;
create policy "recipe_share_links_insert_own"
on public.recipe_share_links
for insert
to authenticated
with check (
  auth.uid() = owner_user_id
  and exists (
    select 1
    from public.recipes r
    where r.id = recipe_share_links.recipe_id
      and r.user_id = auth.uid()
  )
);

drop policy if exists "recipe_share_links_update_own" on public.recipe_share_links;
create policy "recipe_share_links_update_own"
on public.recipe_share_links
for update
to authenticated
using (auth.uid() = owner_user_id)
with check (
  auth.uid() = owner_user_id
  and exists (
    select 1
    from public.recipes r
    where r.id = recipe_share_links.recipe_id
      and r.user_id = auth.uid()
  )
);

drop policy if exists "recipe_share_links_delete_own" on public.recipe_share_links;
create policy "recipe_share_links_delete_own"
on public.recipe_share_links
for delete
to authenticated
using (auth.uid() = owner_user_id);

revoke all on public.recipe_share_links from anon;
grant select, insert, update, delete on public.recipe_share_links to authenticated;
