-- Requires: public.users (see 20260207000000_create_users.sql)

create table if not exists public.billing_customers (
  user_id uuid primary key references public.users(id) on delete cascade,
  stripe_customer_id text unique not null,
  created_at timestamptz default now()
);

create table if not exists public.subscriptions (
  user_id uuid primary key references public.users(id) on delete cascade,
  stripe_subscription_id text unique not null,
  status text not null,
  price_id text not null,
  current_period_end timestamptz,
  cancel_at_period_end boolean default false,
  trial_end timestamptz,
  updated_at timestamptz default now()
);

create index if not exists idx_subscriptions_stripe_id on public.subscriptions(stripe_subscription_id);
