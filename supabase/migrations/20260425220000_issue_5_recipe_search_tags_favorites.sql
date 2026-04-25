-- Issue #5: Recipe library search, tags, and favorites.

alter table public.recipes
  add column if not exists tags text[] not null default '{}'::text[];

alter table public.recipes
  add column if not exists is_favorite boolean not null default false;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'recipes_tags_max_count'
  ) then
    alter table public.recipes
      add constraint recipes_tags_max_count
      check (coalesce(array_length(tags, 1), 0) <= 20);
  end if;
end;
$$;

create index if not exists recipes_tags_gin on public.recipes using gin (tags);

create index if not exists recipes_favorite_by_user on public.recipes (user_id)
where is_favorite = true;
