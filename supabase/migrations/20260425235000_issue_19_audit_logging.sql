-- Issue #19: internal audit logging for destructive user actions.

create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_user_id uuid not null references auth.users(id) on delete cascade,
  action_type text not null check (char_length(action_type) <= 80),
  target_type text not null check (char_length(target_type) <= 80),
  target_id uuid not null,
  created_at timestamptz not null default timezone('utc'::text, now())
);

create index if not exists audit_logs_actor_created_idx
on public.audit_logs (actor_user_id, created_at desc);

create index if not exists audit_logs_action_created_idx
on public.audit_logs (action_type, created_at desc);

alter table public.audit_logs enable row level security;

drop policy if exists "audit_logs_insert_own" on public.audit_logs;
create policy "audit_logs_insert_own"
on public.audit_logs
for insert
to authenticated
with check (auth.uid() = actor_user_id);

revoke all on public.audit_logs from anon;
grant insert on public.audit_logs to authenticated;
