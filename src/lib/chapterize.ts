// TS port of the Supabase `_aab_chapterize` migration parser, used by the
// "整章粘贴自动拆分" editor feature. Splits a pasted chapter blob into
// (chapterTitle, body) pieces:
//   A. leading 《title》 line -> chapter; '#'-separated blocks become excerpts.
//   B. no 《》: a heading-ish first line of the blob or of a '#' block (short,
//      no sentence-final punctuation, followed by a blank line) starts a
//      chapter; blocks of pure Chinese numerals ("七") are chapter markers.
//   C. pieces before any recognized chapter get chapterTitle = null
//      (caller decides the fallback, e.g. selected chapter or "M月D日").

export interface ChapterizedPiece {
  chapterTitle: string | null
  body: string
}

// String.trim() strips U+3000 (fullwidth space) too, matching the SQL _aab_ftrim
const ftrim = (t: string): string => t.trim()

const isHeadingish = (line: string): boolean =>
  line !== '' &&
  line.length <= 22 &&
  !/[。！？…，,.;；:：!?、]$/.test(line) &&
  !/^[——–—]/.test(line)

const cleanTitle = (line: string): string => {
  const stripped = ftrim(
    line.replace(/^(?:[#＃＞>*•·➡→⇒▶\u3000\s-]|\uFE0F)+/, ''),
  )
  if (stripped === '') return ftrim(line)
  const bracketed = stripped.match(/^《(.+)》$/)
  return bracketed ? ftrim(bracketed[1]) : stripped
}

const splitBlocks = (text: string): string[] =>
  `\n${text}`.split(/\n#+[ \t\u3000]*/)

export const chapterize = (content: string): ChapterizedPiece[] => {
  const pieces: ChapterizedPiece[] = []
  const bracketMatch = content.match(/^\s*《([^》]+)》/)

  if (bracketMatch) {
    const title = ftrim(bracketMatch[1])
    const rest = content.replace(/^\s*《[^》]+》/, '')
    for (const raw of splitBlocks(rest)) {
      const body = ftrim(raw)
      if (body) pieces.push({ chapterTitle: title, body })
    }
    if (pieces.length === 0) {
      pieces.push({ chapterTitle: title, body: ftrim(content) })
    }
    return pieces
  }

  const parts = splitBlocks(content)
  let current: string | null = null
  parts.forEach((raw, index) => {
    const t = ftrim(raw)
    if (!t) return

    if (index > 0 && /^[一二三四五六七八九十百千零〇]+$/.test(t)) {
      current = t
      return
    }

    const newlineAt = t.indexOf('\n')
    const firstLine = ftrim(newlineAt === -1 ? t : t.slice(0, newlineAt))
    const remainder = newlineAt === -1 ? '' : ftrim(t.slice(newlineAt + 1))

    if (index === 0) {
      if (isHeadingish(firstLine) && (remainder !== '' || parts.length > 1)) {
        current = cleanTitle(firstLine)
        if (remainder !== '') {
          pieces.push({ chapterTitle: current, body: remainder })
        }
        return
      }
    } else if (
      isHeadingish(firstLine) &&
      remainder !== '' &&
      /^[^\n]*\n[ \t\u3000]*\n/.test(t)
    ) {
      current = cleanTitle(firstLine)
      pieces.push({ chapterTitle: current, body: remainder })
      return
    }

    pieces.push({ chapterTitle: current, body: t })
  })

  if (pieces.length === 0) {
    const body = ftrim(content)
    if (body) pieces.push({ chapterTitle: null, body })
  }
  return pieces
}

/** True when auto-split would produce something richer than one loose excerpt. */
export const looksChapterized = (content: string): boolean => {
  const pieces = chapterize(content)
  return (
    pieces.length > 1 || (pieces.length === 1 && pieces[0].chapterTitle !== null)
  )
}
