create table if not exists public.syzygy_settings (
  user_id uuid primary key references auth.users (id) on delete cascade,
  system_prompt text,
  temperature double precision,
  top_p double precision,
  max_tokens integer,
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
  enabled boolean not null default false,
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

insert into public.openrouter_models (id, label, enabled, sort_order)
values
  ('openai/gpt-4o-mini', 'GPT-4o Mini', true, 0),
  ('openai/gpt-4o', 'GPT-4o', true, 1),
  ('anthropic/claude-3.5-sonnet', 'Claude 3.5 Sonnet', true, 2)
on conflict (id) do update
set
  label = excluded.label,
  enabled = excluded.enabled,
  sort_order = excluded.sort_order,
  updated_at = now();
