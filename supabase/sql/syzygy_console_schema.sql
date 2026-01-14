create table if not exists public.syzygy_settings (
  user_id uuid primary key references auth.users (id) on delete cascade,
  system_prompt text,
  temperature double precision,
  model text,
  updated_at timestamptz not null default now()
);

alter table public.syzygy_settings enable row level security;

create policy "syzygy_settings_select_own"
  on public.syzygy_settings
  for select
  using (auth.uid() = user_id);

create policy "syzygy_settings_insert_own"
  on public.syzygy_settings
  for insert
  with check (auth.uid() = user_id);

create policy "syzygy_settings_update_own"
  on public.syzygy_settings
  for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create table if not exists public.openrouter_models (
  id text primary key,
  label text not null,
  enabled boolean not null default true,
  sort_order integer not null default 0,
  updated_at timestamptz not null default now()
);

alter table public.openrouter_models enable row level security;

create policy "openrouter_models_select_enabled"
  on public.openrouter_models
  for select
  using (auth.role() = 'authenticated' and enabled = true);

create policy "openrouter_models_manage"
  on public.openrouter_models
  for all
  using (auth.role() = 'authenticated')
  with check (auth.role() = 'authenticated');
