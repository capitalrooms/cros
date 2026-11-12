// Rightmove documents (12 Nov 2026) — what a landlord gives us so a property can go on Rightmove through OpenRent:
// a signed letter of authority, proof of ownership and photo ID (migration 282). The letter is written for them
// (letterPdf) — they print it or copy it out by hand, sign, and send a photo. Server-only.
import crypto from 'crypto'
import type { SupabaseClient } from '@supabase/supabase-js'
import { landlordName } from '@/lib/people'

export const OWNERSHIP_TYPES: { key: string; label: string }[] = [
  { key: 'land_registry', label: 'Land Registry title' },
  { key: 'insurance', label: 'Insurance certificate' },
  { key: 'solicitor', label: 'Signed letter from a solicitor (completion letter, or confirming ownership)' },
  { key: 'mortgage', label: 'Mortgage letter' },
]
export const BUCKET = 'landlord-docs'
// stored as <folder>/<type>_<time>_<rand>.<ext>; id_document and proof_of_ownership are encrypted (lib/files/fileCrypt)
export const DOC_TYPES: Record<'letter' | 'ownership' | 'id', string> = { letter: 'other_document', ownership: 'proof_of_ownership', id: 'id_document' }
export const COLUMN: Record<'letter' | 'ownership' | 'id', string> = { letter: 'letter_path', ownership: 'ownership_path', id: 'id_path' }
export const newToken = () => crypto.randomBytes(18).toString('base64url')
export const folderFor = (token: string) => `rm-${token}`
export const oneLine = (a: string | null | undefined) => String(a ?? '').replace(/\s*\n\s*/g, ', ').trim()

export async function requestByToken(s: SupabaseClient, token: string) {
  if (!/^[\w-]{20,40}$/.test(token)) return null
  const { data } = await s.from('portal_authority_requests').select('*, properties(name, address, postcode), people!landlord_id(salutation, first_name, last_name, full_name, company, email)').eq('token', token).maybeSingle() as { data: any }
  if (!data) return null
  const addr = oneLine(data.properties?.address || data.properties?.name)
  const pc = data.properties?.postcode && !addr.toUpperCase().includes(String(data.properties.postcode).toUpperCase()) ? `, ${data.properties.postcode}` : ''
  return { row: data, address: `${addr}${pc}`, landlord: data.people ? landlordName(data.people) : '' }
}

/** The letter of authority, written for the landlord to sign — plain, as their own letter (not on our letterhead). */
export async function letterPdf(o: { landlord: string; address: string }): Promise<Buffer> {
  // @ts-ignore pdfkit ships without types here
  const PDFKit = (await import('pdfkit')).default
  const doc = new PDFKit({ size: 'A4', margin: 64, info: { Title: 'Letter of authority', Author: o.landlord || 'Landlord' } })
  const chunks: Buffer[] = []
  doc.on('data', (c: Buffer) => chunks.push(c))
  const W = 595.28 - 128
  const today = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/London' })
  doc.font('Helvetica').fontSize(11).fillColor('#111')
  doc.text(today, { align: 'right' }).moveDown(2)
  doc.text('To: OpenRent Ltd and Rightmove plc').moveDown(1.5)
  doc.font('Helvetica-Bold').fontSize(14).text('Letter of authority').moveDown(0.3)
  doc.font('Helvetica-Bold').fontSize(11).text(o.address).moveDown(1.5)
  doc.font('Helvetica').fontSize(11.5)
  doc.text(`I, ${o.landlord || '______________________________'}, confirm that I am the owner of the property at ${o.address}.`, { width: W, lineGap: 4 }).moveDown()
  doc.text('I authorise Capital Rooms Ltd, of Hoxton Mix, 66 Paul Street, London EC2A 4NA, to advertise this property to let on my behalf on Rightmove, OpenRent and other property portals, and to arrange viewings and the letting as my agent.', { width: W, lineGap: 4 }).moveDown()
  doc.text('Copies of my proof of ownership and photo identification are provided with this letter.', { width: W, lineGap: 4 }).moveDown(3)
  const line = (label: string) => { const y = doc.y; doc.text(label, 64, y); doc.moveTo(160, y + 12).lineTo(64 + W, y + 12).lineWidth(0.8).strokeColor('#111').stroke(); doc.moveDown(2.4) }
  line('Signed')
  line('Full name')
  line('Date')
  doc.end()
  return new Promise<Buffer>(resolve => doc.on('end', () => resolve(Buffer.concat(chunks))))
}
