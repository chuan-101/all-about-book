-- Helper functions for the excerpts -> chapters data migration.
-- Applied to Supabase on 2026-07-13 as migration `add_chapterize_helper_functions`.
-- Pure functions; no data is modified. Kept in the DB so the migration in
-- excerpts_chapterize_apply.sql (and any future re-import) can reuse them.

create or replace function public._aab_ftrim(t text)
returns text language sql immutable as $fn$
  select regexp_replace(coalesce(t, ''), '(^[[:space:]　]+)|([[:space:]　]+$)', '', 'g')
$fn$;

create or replace function public._aab_is_headingish(l text)
returns boolean language sql immutable as $fn$
  select l is not null
     and l <> ''
     and char_length(l) <= 22
     and l !~ '[。！？…，,.;；:：!?、]$'
     and l !~ '^[——–—]'
$fn$;

create or replace function public._aab_clean_title(l text)
returns text language sql immutable as $fn$
  with stripped as (
    select public._aab_ftrim(
      regexp_replace(coalesce(l, ''), '^[#＃＞>*•·➡→⇒▶️[:space:]　-]+', '')
    ) as s
  )
  select case
    when s = '' then public._aab_ftrim(l)
    when s ~ '^《.+》$' then public._aab_ftrim(regexp_replace(s, '^《(.+)》$', '\1'))
    else s
  end from stripped
$fn$;

-- Splits one legacy excerpt blob into (ord, chapter title, single-excerpt body) rows.
-- Rules:
--   A. leading 《title》 line -> chapter; '#'-separated blocks become excerpts.
--   B. no 《》: heading-ish first line of the blob or of a '#' block (short, no
--      sentence-final punctuation, followed by a blank line) starts a chapter;
--      blocks consisting only of Chinese numerals ("七") are chapter markers.
--   C. anything before the first recognized chapter falls back to the excerpt
--      date (Asia/Shanghai, "M月D日") as the chapter title.
create or replace function public._aab_chapterize(p_content text, p_created timestamptz)
returns table(ord int, chapter_title text, body text)
language plpgsql immutable as $fn$
declare
  v_date_title text := to_char(p_created at time zone 'Asia/Shanghai', 'FMMM月FMDD日');
  v_bracket text;
  v_rest text;
  v_parts text[];
  v_raw text;
  v_t text;
  v_first text;
  v_remainder text;
  v_cur text := null;
  v_ord int := 0;
  i int;
begin
  v_bracket := (regexp_match(p_content, '^[[:space:]　]*《([^》]+)》'))[1];

  if v_bracket is not null then
    v_cur := public._aab_ftrim(v_bracket);
    v_rest := regexp_replace(p_content, '^[[:space:]　]*《[^》]+》', '');
    v_parts := regexp_split_to_array(E'\n' || v_rest, E'\\n#+[ \\t　]*');
    for i in 1..coalesce(array_length(v_parts, 1), 0) loop
      v_t := public._aab_ftrim(v_parts[i]);
      if v_t = '' then continue; end if;
      v_ord := v_ord + 1;
      ord := v_ord; chapter_title := v_cur; body := v_t;
      return next;
    end loop;
    if v_ord = 0 then
      ord := 1; chapter_title := v_cur; body := public._aab_ftrim(p_content);
      return next;
    end if;
    return;
  end if;

  v_parts := regexp_split_to_array(E'\n' || p_content, E'\\n#+[ \\t　]*');
  for i in 1..coalesce(array_length(v_parts, 1), 0) loop
    v_raw := v_parts[i];
    v_t := public._aab_ftrim(v_raw);
    if v_t = '' then continue; end if;

    -- pure Chinese-numeral block: chapter marker for the blocks that follow
    if i > 1 and v_t ~ '^[一二三四五六七八九十百千零〇]+$' then
      v_cur := v_t;
      continue;
    end if;

    v_first := public._aab_ftrim(split_part(v_t, E'\n', 1));
    v_remainder := public._aab_ftrim(regexp_replace(v_t, '^[^\n]*(\n|$)', ''));

    if i = 1 then
      -- preamble before any '#': a heading-ish lone/lead line names the chapter
      if public._aab_is_headingish(v_first)
         and (v_remainder <> '' or coalesce(array_length(v_parts, 1), 1) > 1) then
        v_cur := public._aab_clean_title(v_first);
        if v_remainder <> '' then
          v_ord := v_ord + 1;
          ord := v_ord; chapter_title := v_cur; body := v_remainder;
          return next;
        end if;
        continue;
      end if;
    else
      -- '#' block whose first line is a heading followed by a blank line
      if public._aab_is_headingish(v_first)
         and v_remainder <> ''
         and v_t ~ E'^[^\\n]*\\n[[:space:]　]*\\n' then
        v_cur := public._aab_clean_title(v_first);
        v_ord := v_ord + 1;
        ord := v_ord; chapter_title := v_cur; body := v_remainder;
        return next;
        continue;
      end if;
    end if;

    v_ord := v_ord + 1;
    ord := v_ord; chapter_title := coalesce(v_cur, v_date_title); body := v_t;
    return next;
  end loop;

  if v_ord = 0 then
    ord := 1; chapter_title := v_date_title; body := public._aab_ftrim(p_content);
    return next;
  end if;
end;
$fn$;
