// Receipts and other files sent with an invoice or letter (migration 254, 1 Nov 2026, Harry: "upload docs to
// accompany e.g. pdf or JPEG receipts … added to their landlord profile … a whole list of all receipts on their
// landlord login"). Kept with the document; the email carries a private link (share_token) for a landlord who isn't
// in the app yet, and the landlord app lists them under the invoice. Server-only.
import crypto from 'crypto'
import type { SupabaseClient } from '@supabase/supabase-js'

export const FILE_TYPES: Record<string, string> = { 'application/pdf': 'pdf', 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/heic': 'heic' }
export const MAX_FILE_BYTES = 20 * 1024 * 1024

export interface DocFile { id: string; document_id: string; storage_path: string; file_name: string; content_type: string; size_bytes: number | null; created_at: string }

export const missingFilesTable = (e: { message?: string } | null) => !!e && /generated_document_files|share_token/.test(e.message ?? '')

export async function filesFor(s: SupabaseClient, documentIds: string[]): Promise<DocFile[]> {
  if (!documentIds.length) return []
  const { data, error } = await s.from('generated_document_files').select('id, document_id, storage_path, file_name, content_type, size_bytes, created_at')
    .in('document_id', documentIds).is('removed_at', null).order('created_at')
  if (error) return []
  return (data ?? []) as DocFile[]
}

/** The document's private link token, made the first time it's needed. */
export async function shareTokenFor(s: SupabaseClient, documentId: string): Promise<string | null> {
  const { data } = await s.from('generated_documents').select('share_token').eq('id', documentId).maybeSingle()
  if ((data as any)?.share_token) return (data as any).share_token
  const token = crypto.randomBytes(24).toString('base64url')
  const { error } = await s.from('generated_documents').update({ share_token: token }).eq('id', documentId)
  return error ? null : token
}
