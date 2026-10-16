// GET / PUT /api/admin/deposits/scheme — the deposit scheme's contact details printed on the prescribed information
// (system_settings deposit_scheme_details; lib/deposits/prescribedInfo).
import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/adminAuth'
import { createServiceClient } from '@/lib/supabase'
import { schemeDetails, DPS_TERMS_FILE } from '@/lib/deposits/prescribedInfo'
import fs from 'node:fs'
import path from 'node:path'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  if (!(await requireAdmin(req))) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const r = await schemeDetails(createServiceClient() as any)
  return NextResponse.json({ ...r, termsReady: fs.existsSync(path.join(process.cwd(), 'public', DPS_TERMS_FILE)) })
}

export async function PUT(req: NextRequest) {
  const admin = await requireAdmin(req)
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const b = await req.json().catch(() => ({}))
  const clean = (v: unknown) => String(v ?? '').trim().slice(0, 200)
  const value = JSON.stringify({ name: clean(b.name), address: clean(b.address), phone: clean(b.phone), email: clean(b.email), website: clean(b.website) })
  const { error } = await (createServiceClient() as any).from('system_settings').upsert({ key: 'deposit_scheme_details', value, updated_by: admin.personId, updated_at: new Date().toISOString() })
  return error ? NextResponse.json({ error: error.message }, { status: 500 }) : NextResponse.json({ ok: true })
}
