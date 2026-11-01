// A saved agreement found by its landlord review link (migration 253; app/agreement/[token]).
import { createServiceClient } from '@/lib/supabase'

export async function agreementByToken(token: string) {
  if (!/^[A-Za-z0-9_-]{20,64}$/.test(token)) return null
  const { data } = await createServiceClient().from('management_agreements')
    .select('id, agreement_type, client_name, properties, version, pdf_path, form, review_sent_at, review_sent_by, review_sent_to, ready_at, deleted_at')
    .eq('review_token', token).maybeSingle()
  return data && !(data as any).deleted_at ? data as any : null
}
