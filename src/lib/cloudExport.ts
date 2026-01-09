import type { User } from '@supabase/supabase-js'
import { BACKUP_VERSION, type BackupPayload } from './backup'
import {
  fetchBooks,
  fetchCheckIns,
  fetchDiscussions,
  fetchExcerpts,
} from './cloudRead'

export const fetchCloudBackupPayload = async (
  user: User,
): Promise<BackupPayload> => {
  const [books, checkIns, excerpts, discussions] = await Promise.all([
    fetchBooks(user),
    fetchCheckIns(user),
    fetchExcerpts(user),
    fetchDiscussions(user),
  ])

  return {
    meta: {
      version: BACKUP_VERSION,
      exportedAt: new Date().toISOString(),
    },
    books,
    checkIns,
    excerpts,
    discussions,
  }
}
