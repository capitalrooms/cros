/**
 * POST /api/admin/bulk-tenancy-generator/parse
 *
 * Accepts raw pasted text (landlord email) and uses Claude to extract
 * structured tenancy rows. Returns an array of parsed tenancy objects.
 */

import { NextRequest, NextResponse } from 'next/server'
import { requireStaff } from '@/lib/portalAuth'
import { createClient } from '@supabase/supabase-js'
import Anthropic from '@anthropic-ai/sdk'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

function serviceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  )
}

const SYSTEM = `You are a data extraction assistant for a UK lettings agency.
Extract tenancy information from the pasted text and return a JSON array.
Each tenancy should be an object with these fields:
  property_name   — full property address (infer from context if multiple properties)
  room_number     — room number as integer (e.g. 1, 2, 3) or null if not specified
  salutation      — title only (e.g. "Mr", "Mrs", "Miss", "Ms", "Dr", "Prof") or null
  tenant_name     — full name WITHOUT the title (e.g. "Ethan Longford", "Rosa Koivunoro")
  tenant_email    — email address or null if not provided
  tenant_phone    — phone number or null if not provided
  rent_amount     — monthly rent as number (e.g. 944.80)
  deposit_amount  — deposit as number (e.g. 1090.15)
  start_date_raw  — start date as written (e.g. "05/10/2026" or "16/10"), or null
  notes           — any other notes about this tenancy (e.g. "always 5 weeks deposit")
  charge_tenant_reference     — true if the text says this tenant is to be referenced / charged for referencing, else false
  charge_guarantor_signatory  — true if the text says this room has a guarantor to add as a signer (or charges for adding one), else false
  charge_guarantor_reference  — true if the text says this room's guarantor is to be referenced / charged for it, else false
  cleaning_payer      — who pays for cleaning of the communal areas if the text says: "landlord" (included in the rent),
                        "tenant" (tenants pay) or "none" (no cleaner); null if not mentioned. Use the same value on every row.
  cleaning_frequency  — how often the cleaner comes if the text says: "weekly", "fortnightly" (every two weeks),
                        "twice_monthly" (twice a month / twice monthly) or "monthly"; null if not mentioned.

The text may also include notes about what to invoice the landlord, e.g. "£75 per room plus £25 on room 5
for adding a guarantor as a signer". These are NOT tenancies — use them only to set the charge_* flags on the
matching rooms (by room number or tenant name; "all rooms" applies to every row). The £75 agreement fee is
always charged per room, so it needs no flag.

If there are multiple properties in the text, identify each one.
If a start date applies to multiple tenancies in a block, use it for all of them.
If a date like "16/10" is given without a year, assume the current year 2026.
Dates in dd/mm/yyyy format — convert to ISO: "2026-10-16".
Return ONLY valid JSON array, no explanation.`

// Invoice-only mode: past tenancy work to bill, e.g. "090ROS02 - £150 referencing and paperwork (Nigel to pay)"
const INVOICE_SYSTEM = (landlord: string) => `You are a data extraction assistant for a UK lettings agency.
The pasted text lists tenancy services already carried out that now need invoicing${landlord ? `. The landlord is ${landlord}` : ''}.
Return a JSON array with one object per charge line:
  ref            — the reference/code exactly as written (e.g. "090ROS02", "KFT9"), or null
  property       — the property address if given; otherwise the property code WITHOUT any room number
                   (e.g. "090ROS02" → "090ROS", "012QDC02" → "012QDC", "KFT9" → "KFT9"). Lines for the same property must use identical text.
  room_number    — room number as integer if the ref or text gives one (e.g. "090ROS02" → 2), else null
  tenant_name    — tenant name if mentioned, else null
  service        — what was done, in plain words with normal capitalisation (e.g. "Referencing and paperwork", "Deed of assignment");
                   if no service is stated use "Tenancy set-up"
  amount         — the charge as a number (e.g. 150, 175)
  payer_type     — "landlord" if the landlord pays (by name, e.g. "Nigel to pay", or by default when no payer is stated),
                   "tenant" if the tenants pay, otherwise "other"
  payer_name     — who pays as written (e.g. "Nigel", "Tenants", "Joel / Tenants", "Dhruv"), or null
Ignore greetings and sign-offs. Return ONLY a valid JSON array, no explanation.`

export async function POST(req: NextRequest) {
  if (!(await requireStaff(req as any))) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  try {
    // Admin-only route — page is auth-gated; service client used for DB access

    const { text, mode, landlord } = await req.json()
    if (!text?.trim()) return NextResponse.json({ error: 'text required' }, { status: 400 })

    if (!process.env.ANTHROPIC_API_KEY) {
      return NextResponse.json({ error: 'ANTHROPIC_API_KEY not configured on server' }, { status: 500 })
    }

    const message = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 4096,
      system: mode === 'invoice' || mode === 'invoices' ? INVOICE_SYSTEM(String(landlord || '')) : SYSTEM,
      messages: [{ role: 'user', content: text.trim() }],
    })

    const raw = message.content[0].type === 'text' ? message.content[0].text : ''

    const jsonMatch = raw.match(/\[[\s\S]*\]/)
    if (!jsonMatch) {
      return NextResponse.json({ error: 'Could not parse response from AI', raw }, { status: 422 })
    }

    let rows: any[]
    try {
      rows = JSON.parse(jsonMatch[0])
    } catch {
      return NextResponse.json({ error: 'Invalid JSON from AI', raw }, { status: 422 })
    }

    rows = rows.map((r, i) => ({ ...r, _id: `row-${i}` }))
    return NextResponse.json({ rows })

  } catch (err: any) {
    console.error('bulk-tenancy parse error:', err)
    return NextResponse.json({ error: err?.message || 'Internal server error' }, { status: 500 })
  }
}
