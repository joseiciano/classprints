-- Requires: public.users (see 20260207000000_create_users.sql)

create table if not exists public.seating_configs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  name text not null,
  students jsonb not null,
  conflicts jsonb not null default '{}'::jsonb,
  works_well_with_soft jsonb not null default '{}'::jsonb,
  works_well_with_strong jsonb not null default '{}'::jsonb,
  seat_contenders jsonb not null default '{}'::jsonb,
  seating_grid jsonb not null,
  created_at bigint not null,
  updated_at bigint not null
);

create index if not exists idx_seating_configs_user_id on public.seating_configs(user_id);
create index if not exists idx_seating_configs_created_at on public.seating_configs(created_at desc);
