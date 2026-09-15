-- Requires: public.users (see 20260207000000_create_users.sql)

alter table public.jobs add column if not exists user_id uuid references public.users(id) on delete cascade;
create index if not exists idx_jobs_user_id on public.jobs(user_id);
