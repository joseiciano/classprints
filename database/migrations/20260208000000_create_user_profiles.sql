-- Requires: public.users (see 20260207000000_create_users.sql)

create table if not exists public.user_profiles (
  id uuid primary key references public.users(id) on delete cascade,
  email text not null,
  display_name text,
  deleted_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Server-side session management (Better Auth core schema).
create table if not exists public.auth_sessions (
  token uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  expires_at timestamptz not null,
  revoked_at timestamptz,
  created_at timestamptz default now()
);

create index if not exists idx_auth_sessions_user on public.auth_sessions(user_id);

-- Email-change confirmations.
create table if not exists public.auth_email_changes (
  token uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  new_email text not null,
  expires_at timestamptz not null,
  created_at timestamptz default now()
);
