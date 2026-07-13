-- Data migration: split legacy excerpt blobs into chapters + single excerpts.
-- Depends on: chapters_schema.sql and the _aab_* helper functions
-- (migration `add_chapterize_helper_functions`).
--
-- Safety:
--   * Full backups are taken first (excerpts_backup_20260713 / excerpt_resonances_backup_20260713).
--   * The first parsed piece of each blob keeps the original row id, so
--     excerpt_resonances stay attached without any FK rewrite.
--   * Rows that already have chapter_id are skipped, so re-running is safe.
--
-- Rollback: restore from the backup tables
--   truncate public.excerpts cascade;  -- NOTE: cascades to excerpt_resonances
--   insert into public.excerpts select * from public.excerpts_backup_20260713;
--   insert into public.excerpt_resonances select * from public.excerpt_resonances_backup_20260713;
--   delete from public.chapters;

-- 1. Backups (RLS on with no policies: only service role can read them).
create table if not exists public.excerpts_backup_20260713 as
  select * from public.excerpts;
alter table public.excerpts_backup_20260713 enable row level security;

create table if not exists public.excerpt_resonances_backup_20260713 as
  select * from public.excerpt_resonances;
alter table public.excerpt_resonances_backup_20260713 enable row level security;

-- 2. Transform.
do $$
declare
  r record;
  p record;
  v_chapter_id uuid;
  v_first boolean;
  v_n int;
begin
  for r in
    select e.* from public.excerpts e
    where e.chapter_id is null
    order by e.created_at, e.id
  loop
    v_first := true;
    v_n := 0;
    for p in
      select * from public._aab_chapterize(r.content, r.created_at) order by ord
    loop
      select id into v_chapter_id
      from public.chapters
      where book_id = r.book_id and title = p.chapter_title;

      if v_chapter_id is null then
        insert into public.chapters (user_id, book_id, title, created_at, updated_at)
        values (r.user_id, r.book_id, p.chapter_title, r.created_at, r.created_at)
        returning id into v_chapter_id;
      end if;

      if v_first then
        -- keep the original id (and created_at/updated_at) on the first piece
        update public.excerpts
        set content = p.body,
            chapter_id = v_chapter_id,
            chapter = p.chapter_title
        where id = r.id;
        v_first := false;
      else
        insert into public.excerpts
          (id, user_id, book_id, content, page, chapter, chapter_id, created_at, updated_at)
        values
          (gen_random_uuid(), r.user_id, r.book_id, p.body, r.page, p.chapter_title,
           v_chapter_id,
           r.created_at + (p.ord - 1) * interval '1 millisecond',
           r.updated_at);
      end if;
      v_n := v_n + 1;
    end loop;

    if v_n = 0 then
      raise exception 'chapterize produced no pieces for excerpt %', r.id;
    end if;
  end loop;

  -- Chapters in reading order per book (by their earliest excerpt).
  update public.chapters c
  set sort_order = t.rn
  from (
    select ch.id,
           row_number() over (
             partition by ch.book_id
             order by x.first_at nulls last, ch.created_at, ch.id
           ) as rn
    from public.chapters ch
    left join (
      select chapter_id, min(created_at) as first_at
      from public.excerpts
      where chapter_id is not null
      group by chapter_id
    ) x on x.chapter_id = ch.id
  ) t
  where t.id = c.id;
end $$;

-- 3. Sanity checks.
do $$
declare
  v_src int;
  v_now int;
  v_chap int;
  v_orphan int;
  v_reso_broken int;
begin
  select count(*) into v_src from public.excerpts_backup_20260713;
  select count(*) into v_now from public.excerpts;
  select count(*) into v_chap from public.chapters;
  select count(*) into v_orphan from public.excerpts where chapter_id is null;
  select count(*) into v_reso_broken
  from public.excerpt_resonances rr
  where not exists (select 1 from public.excerpts e where e.id = rr.excerpt_id);

  raise notice 'excerpts: % -> %, chapters: %, unchaptered: %, broken resonances: %',
    v_src, v_now, v_chap, v_orphan, v_reso_broken;

  if v_now < v_src then
    raise exception 'excerpt count shrank (% -> %)', v_src, v_now;
  end if;
  if v_orphan > 0 then
    raise exception 'unexpected unchaptered rows: %', v_orphan;
  end if;
  if v_reso_broken > 0 then
    raise exception 'resonances lost their excerpt anchor: %', v_reso_broken;
  end if;
end $$;
