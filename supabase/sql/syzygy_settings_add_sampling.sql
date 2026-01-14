alter table public.syzygy_settings
  add column if not exists top_p double precision;

alter table public.syzygy_settings
  add column if not exists max_tokens integer;
