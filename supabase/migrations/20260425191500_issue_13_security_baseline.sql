-- Security baseline scaffolding for issue #13.
-- Apply with Supabase CLI: supabase db push

create table if not exists public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now())
);

create table if not exists public.recipes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(name) <= 160),
  source_url text,
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now())
);

create table if not exists public.feature_flags (
  key text primary key,
  enabled boolean not null default false,
  updated_at timestamptz not null default timezone('utc'::text, now())
);

insert into public.feature_flags (key, enabled)
values
  ('url_import', true),
  ('recipe_sharing', true)
on conflict (key) do nothing;

alter table public.profiles enable row level security;
alter table public.recipes enable row level security;
alter table public.feature_flags enable row level security;

drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own"
on public.profiles
for select
to authenticated
using (auth.uid() = user_id);

drop policy if exists "profiles_insert_own" on public.profiles;
create policy "profiles_insert_own"
on public.profiles
for insert
to authenticated
with check (auth.uid() = user_id);

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own"
on public.profiles
for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "recipes_select_own" on public.recipes;
create policy "recipes_select_own"
on public.recipes
for select
to authenticated
using (auth.uid() = user_id);

drop policy if exists "recipes_insert_own" on public.recipes;
create policy "recipes_insert_own"
on public.recipes
for insert
to authenticated
with check (auth.uid() = user_id);

drop policy if exists "recipes_update_own" on public.recipes;
create policy "recipes_update_own"
on public.recipes
for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "recipes_delete_own" on public.recipes;
create policy "recipes_delete_own"
on public.recipes
for delete
to authenticated
using (auth.uid() = user_id);

drop policy if exists "feature_flags_read_authenticated" on public.feature_flags;
create policy "feature_flags_read_authenticated"
on public.feature_flags
for select
to authenticated
using (true);

revoke all on public.feature_flags from anon;
grant select on public.feature_flags to authenticated;
