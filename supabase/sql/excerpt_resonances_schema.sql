-- V3.1: Syzygy resonance / 共读旁批 displayed next to All About Book excerpts.
-- Mirrors the live schema in Supabase project zwqabcocmstagasbcnpq so the
-- frontend contract (read by current user, insert own records) is documented.

create table if not exists public.excerpt_resonances (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  excerpt_id uuid not null references public.excerpts(id) on delete cascade,
  book_id uuid references public.books(id) on delete set null,
  speaker text not null,
  content text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.excerpt_resonances is
  'V3.1: Syzygy resonance/comment next to All About Book excerpts.';

create index if not exists idx_excerpt_resonances_excerpt_id
  on public.excerpt_resonances(excerpt_id);

create index if not exists idx_excerpt_resonances_book_id
  on public.excerpt_resonances(book_id);

alter table public.excerpt_resonances enable row level security;

drop policy if exists "Users can read own excerpt resonances"
  on public.excerpt_resonances;
create policy "Users can read own excerpt resonances"
  on public.excerpt_resonances
  for select
  using (auth.uid() = user_id);

drop policy if exists "Users can insert own excerpt resonances"
  on public.excerpt_resonances;
create policy "Users can insert own excerpt resonances"
  on public.excerpt_resonances
  for insert
  with check (auth.uid() = user_id);

drop policy if exists "Users can update own excerpt resonances"
  on public.excerpt_resonances;
create policy "Users can update own excerpt resonances"
  on public.excerpt_resonances
  for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "Users can delete own excerpt resonances"
  on public.excerpt_resonances;
create policy "Users can delete own excerpt resonances"
  on public.excerpt_resonances
  for delete
  using (auth.uid() = user_id);
