import type { User } from '@supabase/supabase-js'
import { BACKUP_VERSION, type BackupPayload } from './backup'
import {
  fetchBooks,
  fetchChapters,
  fetchCheckIns,
  fetchConversations,
  fetchDiscussions,
  fetchExcerpts,
} from './cloudRead'

export const fetchCloudBackupPayload = async (
  user: User,
): Promise<BackupPayload> => {
  const [books, checkIns, excerpts, conversations, discussions, chapters] =
    await Promise.all([
    fetchBooks(user),
    fetchCheckIns(user),
    fetchExcerpts(user),
    fetchConversations(user),
    fetchDiscussions(user),
    fetchChapters(user),
  ])

  return {
    meta: {
      version: BACKUP_VERSION,
      exportedAt: new Date().toISOString(),
    },
    books,
    checkIns,
    excerpts,
    conversations,
    discussions,
    chapters,
  }
}
