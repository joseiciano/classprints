-- Better Auth core schema: first-party user table.
-- Passwords are hashed with PBKDF2-SHA512 by the Workers API (Web Crypto).

create table if not exists public.users (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  password_hash text not null,
  email_confirmed_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.auth_access_tokens (
  token text primary key,
  user_id uuid not null references public.users(id) on delete cascade,
  expires_at timestamptz not null,
  created_at timestamptz default now()
);

create index if not exists idx_auth_access_tokens_user on public.auth_access_tokens(user_id);
