-- 导读 & 总结：每本书各配一张陪读表。
--   book_guides    开新书时写入的阅读辅助（背景、人物表、阅读路线…）
--   book_summaries 读完后写下的感想与总结
-- 写入端 written_by 复用书籍问答的枚举
--   chuanchuan / syzygy-claude / syzygy-gpt / cli_reading_assist
-- 之外也允许写入端自报家门（自由文本），所以列上不做 check 约束。
-- 展示按 created_at（写入时间）排序，编辑只动 content 与 updated_at。
-- Mirrors the live schema in Supabase project zwqabcocmstagasbcnpq.

create table if not exists public.book_guides (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  book_id uuid not null references public.books(id) on delete cascade,
  written_by text not null,
  content text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.book_guides is
  'Reading guide (导读) written before/while opening a book; multiple writers per book.';

create index if not exists idx_book_guides_book_id
  on public.book_guides(book_id);

create index if not exists idx_book_guides_user_id
  on public.book_guides(user_id);

alter table public.book_guides enable row level security;

drop policy if exists "Users can read own book guides"
  on public.book_guides;
create policy "Users can read own book guides"
  on public.book_guides
  for select
  using ((select auth.uid()) = user_id);

drop policy if exists "Users can insert own book guides"
  on public.book_guides;
create policy "Users can insert own book guides"
  on public.book_guides
  for insert
  with check ((select auth.uid()) = user_id);

drop policy if exists "Users can update own book guides"
  on public.book_guides;
create policy "Users can update own book guides"
  on public.book_guides
  for update
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "Users can delete own book guides"
  on public.book_guides;
create policy "Users can delete own book guides"
  on public.book_guides
  for delete
  using ((select auth.uid()) = user_id);

create table if not exists public.book_summaries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  book_id uuid not null references public.books(id) on delete cascade,
  written_by text not null,
  content text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.book_summaries is
  'Closing summary (总结) written after finishing a book; multiple writers per book.';

create index if not exists idx_book_summaries_book_id
  on public.book_summaries(book_id);

create index if not exists idx_book_summaries_user_id
  on public.book_summaries(user_id);

alter table public.book_summaries enable row level security;

drop policy if exists "Users can read own book summaries"
  on public.book_summaries;
create policy "Users can read own book summaries"
  on public.book_summaries
  for select
  using ((select auth.uid()) = user_id);

drop policy if exists "Users can insert own book summaries"
  on public.book_summaries;
create policy "Users can insert own book summaries"
  on public.book_summaries
  for insert
  with check ((select auth.uid()) = user_id);

drop policy if exists "Users can update own book summaries"
  on public.book_summaries;
create policy "Users can update own book summaries"
  on public.book_summaries
  for update
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "Users can delete own book summaries"
  on public.book_summaries;
create policy "Users can delete own book summaries"
  on public.book_summaries
  for delete
  using ((select auth.uid()) = user_id);
