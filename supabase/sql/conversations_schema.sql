create table if not exists public.conversations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  book_id uuid references public.books(id) on delete cascade,
  title text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table public.conversations enable row level security;

drop policy if exists "Allow read own conversations" on public.conversations;
create policy "Allow read own conversations"
  on public.conversations
  for select
  using (user_id = auth.uid());

drop policy if exists "Allow insert own conversations" on public.conversations;
create policy "Allow insert own conversations"
  on public.conversations
  for insert
  with check (
    user_id = auth.uid()
    and exists (
      select 1
      from public.books b
      where b.id = conversations.book_id
        and b.user_id = auth.uid()
    )
  );

drop policy if exists "Allow update own conversations" on public.conversations;
create policy "Allow update own conversations"
  on public.conversations
  for update
  using (user_id = auth.uid());

drop policy if exists "Allow delete own conversations" on public.conversations;
create policy "Allow delete own conversations"
  on public.conversations
  for delete
  using (user_id = auth.uid());

alter table public.discussions
  add column if not exists conversation_id uuid references public.conversations(id) on delete cascade;

create index if not exists idx_discussions_conversation_id
  on public.discussions(conversation_id);

create index if not exists idx_conversations_book_id
  on public.conversations(book_id);

insert into public.conversations (id, user_id, book_id, title, created_at, updated_at)
select
  gen_random_uuid(),
  d.user_id,
  d.book_id,
  '默认对话',
  min(d.created_at),
  min(d.created_at)
from public.discussions d
where d.conversation_id is null
group by d.user_id, d.book_id;

update public.discussions d
set conversation_id = c.id
from public.conversations c
where d.user_id = c.user_id
  and d.book_id = c.book_id
  and d.conversation_id is null;
