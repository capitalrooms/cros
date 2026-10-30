// Identity documents encrypted at rest (30 Oct 2026 — follows lib/crypto/fieldCrypt for bank details). A landlord's
// photo ID, proof of address and the company/ownership papers uploaded for AML are stored in storage as
//   "CRENC1" | iv (12) | auth tag (16) | AES-256-GCM ciphertext
// with the same key as the bank details (CROS_FIELD_KEY, kept on Vercel, never in the database or storage). A copy of
// the storage bucket alone is unreadable.
//   sealBytes / openBytes   — encrypt / decrypt (a file that isn't encrypted is returned as it is)
//   isIdentityPath          — which landlord-docs files get encrypted (named by their AML document type)
//   viewLink                — a short-lived link to our own server (app/api/files/view) that decrypts and shows the file;
//                             a plain storage link would hand over the scrambled bytes
// Server-only.
import crypto from 'crypto'
import { PORTAL_URL } from '@/lib/emailWrapper'

const MAGIC = Buffer.from('CRENC1')

function keyFrom(v?: string): Buffer | null {
  if (!v) return null
  const k = Buffer.from(v.trim(), 'base64')
  return k.length === 32 ? k : null
}
const currentKey = () => keyFrom(process.env.CROS_FIELD_KEY)
const keys = () => [currentKey(), keyFrom(process.env.CROS_FIELD_KEY_PREVIOUS)].filter(Boolean) as Buffer[]

export const isSealedBytes = (b: Buffer) => b.length > MAGIC.length + 28 && b.subarray(0, MAGIC.length).equals(MAGIC)

/** Encrypt a file's bytes (no key, or already encrypted → returned as they are). */
export function sealBytes(b: Buffer): Buffer {
  const k = currentKey()
  if (!k || isSealedBytes(b)) return b
  const iv = crypto.randomBytes(12)
  const c = crypto.createCipheriv('aes-256-gcm', k, iv)
  const ct = Buffer.concat([c.update(b), c.final()])
  return Buffer.concat([MAGIC, iv, c.getAuthTag(), ct])
}

/** Decrypt a file's bytes (not encrypted → returned as they are). Throws if no key opens it. */
export function openBytes(b: Buffer): Buffer {
  if (!isSealedBytes(b)) return b
  const iv = b.subarray(MAGIC.length, MAGIC.length + 12), tag = b.subarray(MAGIC.length + 12, MAGIC.length + 28), ct = b.subarray(MAGIC.length + 28)
  for (const k of keys()) {
    try {
      const d = crypto.createDecipheriv('aes-256-gcm', k, iv)
      d.setAuthTag(tag)
      return Buffer.concat([d.update(ct), d.final()])
    } catch { /* next key */ }
  }
  throw new Error('This file is encrypted and the key to open it isn’t available (CROS_FIELD_KEY)')
}

/** The AML documents in landlord-docs: "<form token>/<type>_<time>_<rand>.<ext>". */
const IDENTITY_TYPES = ['id_document', 'proof_of_address', 'joint_id_document', 'joint_proof_of_address', 'director_id', 'director_address', 'proof_of_ownership', 'ownership_structure', 'certificate_of_incorporation', 'articles_of_association', 'other_document']
const IDENTITY_RE = new RegExp(`^[^/]+/(?:${IDENTITY_TYPES.join('|')})_\\d+_[a-z0-9]+\\.[a-z0-9]+$`, 'i')
export const isIdentityPath = (bucket: string, path: string) => bucket === 'landlord-docs' && IDENTITY_RE.test(path)

// ── links that open (and decrypt) through our server ───────────────────────────────────────────────────────────────────
const secret = () => `file-view:${process.env.CROS_FIELD_KEY ?? ''}:${process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''}`
const sign = (bucket: string, path: string, exp: number, dl: string) => crypto.createHmac('sha256', secret()).update(`${bucket}\n${path}\n${exp}\n${dl}`).digest('base64url')

/** A link to app/api/files/view that works for `seconds` (absolute URL). `download` names the saved file. */
export function viewLink(bucket: string, path: string, seconds: number, download = ''): string {
  const exp = Math.floor(Date.now() / 1000) + seconds
  const q = new URLSearchParams({ b: bucket, p: path, e: String(exp), s: sign(bucket, path, exp, download), ...(download ? { d: download } : {}) })
  return `${PORTAL_URL}/api/files/view?${q}`
}
export function checkViewLink(q: URLSearchParams): { bucket: string; path: string; download: string } | null {
  const bucket = q.get('b') ?? '', path = q.get('p') ?? '', exp = Number(q.get('e')), s = q.get('s') ?? '', download = q.get('d') ?? ''
  if (!bucket || !path || path.includes('..') || !exp || exp < Date.now() / 1000) return null
  const want = sign(bucket, path, exp, download)
  if (s.length !== want.length || !crypto.timingSafeEqual(Buffer.from(s), Buffer.from(want))) return null
  return { bucket, path, download }
}

/** Encrypt a stored file where it sits (download → seal → upload over it). Nothing to do without a key, or if it
 *  already is. Returns true when it changed the file. */
export async function sealStoredFile(bucket: string, path: string): Promise<boolean> {
  if (!currentKey()) return false
  const { createServiceClient } = await import('@/lib/supabase')
  const store = createServiceClient().storage.from(bucket)
  const { data, error } = await store.download(path)
  if (error || !data) throw new Error(error?.message ?? 'not found')
  const plain = Buffer.from(await data.arrayBuffer())
  if (isSealedBytes(plain)) return false
  const sealed = sealBytes(plain)
  // check it opens again before replacing the only copy
  if (!openBytes(sealed).equals(plain)) throw new Error('encryption check failed — file left as it was')
  const { error: upErr } = await store.upload(path, sealed, { upsert: true, contentType: data.type || 'application/octet-stream' })
  if (upErr) throw new Error(upErr.message)
  return true
}
