alter table public.orders
  add column if not exists checkout_session_attempt_id uuid,
  add column if not exists checkout_session_attempted_at timestamptz;

notify pgrst, 'reload schema';
