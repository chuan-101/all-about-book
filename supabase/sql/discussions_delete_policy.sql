alter table public.discussions enable row level security;

drop policy if exists "Allow delete own discussions" on public.discussions;

create policy "Allow delete own discussions"
  on public.discussions
  for delete
  using (user_id = auth.uid());
