-- Chapters: tree level between books and excerpts (书目 -> 章节 -> 单条摘抄).
-- Applied to Supabase on 2026-07-13 as migration `add_chapters_table_and_excerpt_chapter_id`.
-- Additive only; existing rows/UI keep working (excerpts.chapter_id stays NULL until data migration).

create table if not exists public.chapters (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  book_id uuid not null references public.books(id) on delete cascade,
  title text not null,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.chapters enable row level security;

create policy "Users can view own chapters" on public.chapters
  for select using ((select auth.uid()) = user_id);
create policy "Users can insert own chapters" on public.chapters
  for insert with check ((select auth.uid()) = user_id);
create policy "Users can update own chapters" on public.chapters
  for update using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
create policy "Users can delete own chapters" on public.chapters
  for delete using ((select auth.uid()) = user_id);

create index if not exists chapters_book_id_idx on public.chapters (book_id, sort_order);
create index if not exists chapters_user_id_idx on public.chapters (user_id);
-- One chapter title per book; migration and paste-split both merge by (book_id, title).
create unique index if not exists chapters_book_id_title_key on public.chapters (book_id, title);

-- Deleting a chapter un-files its excerpts instead of deleting them.
alter table public.excerpts
  add column if not exists chapter_id uuid references public.chapters(id) on delete set null;

create index if not exists excerpts_chapter_id_idx on public.excerpts (chapter_id);
