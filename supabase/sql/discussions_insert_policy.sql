alter table public.discussions enable row level security;

drop policy if exists "Allow insert discussions on owned books" on public.discussions;

create policy "Allow insert discussions on owned books"
  on public.discussions
  for insert
  with check (
    user_id = auth.uid()
    and exists (
      select 1
      from public.books b
      where b.id = discussions.book_id
        and b.user_id = auth.uid()
    )
  );
