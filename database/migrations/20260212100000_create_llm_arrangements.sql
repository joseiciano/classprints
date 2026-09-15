-- Requires: public.users (see 20260207000000_create_users.sql)

create table if not exists public.llm_arrangements (
  id bigserial primary key,
  user_id uuid not null references public.users(id) on delete cascade,
  students jsonb not null,
  conflicts jsonb not null,
  works_well_with jsonb not null default '{}'::jsonb,
  seating_grid jsonb not null,
  arrangement jsonb not null,
  fitness_score double precision not null,
  created_at bigint not null
);

create index if not exists idx_llm_arrangements_user_id on public.llm_arrangements(user_id);
