alter table public.discussions
  add column if not exists metadata jsonb;
