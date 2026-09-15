alter table public.user_profiles
  add column if not exists email_notifications_enabled_at timestamptz;
