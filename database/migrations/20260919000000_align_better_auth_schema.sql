-- Aligns the database schema with Better Auth's expected models so auth
-- requests can run. Better Auth's `user` model maps onto the existing
-- public.users table (jobs.user_id / user_profiles.id reference it), its
-- `session` model maps onto public.auth_sessions, and the `account` and
-- `verification` models get their own new tables.
--
-- auth_sessions is dropped and recreated: it holds the legacy session shape
-- (token uuid primary key) and auth has never issued a session — the table is
-- empty in every environment.

-- users: columns Better Auth writes (name, email_verified, image,
-- display_name) or must omit (password_hash was superseded by the account
-- table's password column).
alter table public.users add column if not exists name text;
alter table public.users add column if not exists email_verified boolean not null default false;
alter table public.users add column if not exists image text;
alter table public.users add column if not exists display_name text;
alter table public.users alter column password_hash drop not null;

drop table if exists public.auth_sessions cascade;
create table public.auth_sessions (
  id text primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  token text not null unique,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  ip_address text,
  user_agent text
);
create index if not exists idx_auth_sessions_user on public.auth_sessions(user_id);

-- Better Auth account model (camelCase column names are its defaults).
-- Better Auth delegates id generation to the database default on Postgres.
create table if not exists public.account (
  id text primary key default gen_random_uuid(),
  "accountId" text,
  "providerId" text not null,
  "userId" uuid not null references public.users(id) on delete cascade,
  "accessToken" text,
  "refreshToken" text,
  "accessTokenExpiresAt" timestamptz,
  "refreshTokenExpiresAt" timestamptz,
  scope text,
  "idToken" text,
  password text,
  "createdAt" timestamptz not null default now(),
  "updatedAt" timestamptz not null default now()
);
create index if not exists idx_account_user on public.account("userId");

-- Better Auth verification model (email verification / password reset tokens).
create table if not exists public.verification (
  identifier text not null,
  id text primary key default gen_random_uuid(),
  value text not null,
  "expiresAt" timestamptz not null,
  "createdAt" timestamptz not null default now(),
  "updatedAt" timestamptz not null default now()
);
create index if not exists idx_verification_identifier on public.verification(identifier);
