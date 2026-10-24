// One row per email or text CROS sends (migration 242), so a room's page can show everything a tenant or applicant was
// sent. Written by lib/sendEmail deliverEmail and lib/sms sendSms; never throws, and does nothing until 242 has run.
import { createServiceClient } from '@/lib/supabase'

const plain = (html: string) => html
  .replace(/<style[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' ')
  .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#39;|&rsquo;/g, '’').replace(/&quot;/g, '"')
  .replace(/\s+/g, ' ').trim()

export async function logMessage(m: {
  channel: 'email' | 'sms'
  to: string[]
  cc?: string[]
  subject?: string | null
  html?: string | null
  text?: string | null
  providerId?: string | null
  ok: boolean
  error?: string | null
  sentBy?: string | null
}) {
  try {
    const to = [...new Set(m.to.map(a => String(a).trim()).filter(Boolean))]
    if (!to.length) return
    const preview = (m.text ? m.text.replace(/\s+/g, ' ').trim() : m.html ? plain(m.html) : '').slice(0, 400) || null
    await createServiceClient().from('message_log').insert(to.map(a => ({
      channel: m.channel, to_address: a, cc: m.cc?.length ? m.cc : null, subject: m.subject ? String(m.subject).slice(0, 300) : null,
      preview, provider_id: m.providerId ?? null, status: m.ok ? 'sent' : 'failed', error: m.error ? String(m.error).slice(0, 500) : null,
      sent_by: m.sentBy ? String(m.sentBy).slice(0, 200) : null,
    })))
  } catch { /* the log must never stop a message going */ }
}
