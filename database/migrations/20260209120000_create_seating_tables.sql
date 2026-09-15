-- Requires: public.users (see 20260207000000_create_users.sql)

create table if not exists public.jobs (
  id text primary key,
  email text not null,
  students jsonb not null,
  conflicts jsonb not null,
  works_well_with jsonb not null default '{}'::jsonb,
  works_well_with_strong jsonb not null default '{}'::jsonb,
  external_id text not null default gen_random_uuid()::text,
  algorithm text not null default 'genetic',
  seat_contenders jsonb not null default '{}'::jsonb,
  user_id uuid references public.users(id) on delete cascade,
  seating_grid jsonb not null,
  max_results integer not null,
  idempotency_key text not null,
  status text not null,
  error_message text,
  results_count integer default 0,
  status_metadata jsonb,
  email_sent_at bigint,
  created_at bigint not null,
  updated_at bigint not null
);

create unique index if not exists idx_jobs_idempotency on public.jobs(email, idempotency_key);

create table if not exists public.job_states (
  job_id text primary key references public.jobs(id) on delete cascade,
  current_generation integer not null,
  population text not null,
  best_fitness double precision,
  reseeds integer default 0,
  stagnant_generations integer default 0,
  mode text not null default 'strict',
  updated_at bigint not null
);

create table if not exists public.seating_results (
  id bigserial primary key,
  job_id text not null references public.jobs(id) on delete cascade,
  arrangement jsonb not null,
  fitness_score double precision not null,
  arrangement_hash text not null,
  created_at bigint not null
);

create unique index if not exists idx_seating_results_hash on public.seating_results(job_id, arrangement_hash);
create index if not exists idx_seating_results_job_id on public.seating_results(job_id);
