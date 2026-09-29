/**
 * GET  /api/admin/landlord-bank-accounts?landlord_id=xxx
 * POST /api/admin/landlord-bank-accounts   — create
 * PUT  /api/admin/landlord-bank-accounts   — update (body includes id)
 * DELETE /api/admin/landlord-bank-accounts?id=xxx
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

function service() {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  )
}

async function auth(req: NextRequest) {
  // Auth via Bearer token from client session
  const authHeader = req.headers.get('authorization')
  const token = authHeader?.replace('Bearer ', '')
  if (!token) return null
  const supabase = service()
  const { data: { user } } = await supabase.auth.getUser(token)
  if (!user?.email) return null
  const { data: person } = await supabase
    .from('people').select('id, role').eq('email', user.email).single()
  if (!person || !['administrator', 'admin', 'lettings'].includes(person.role)) return null
  return person
}

export async function GET(req: NextRequest) {
  const landlord_id = req.nextUrl.searchParams.get('landlord_id')
  if (!landlord_id) return NextResponse.json({ error: 'landlord_id required' }, { status: 400 })

  const { data, error } = await service()
    .from('landlord_bank_accounts')
    .select('*')
    .eq('landlord_id', landlord_id)
    .order('is_default', { ascending: false })
    .order('account_label')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ accounts: data || [] })
}

export async function POST(req: NextRequest) {
  const person = await auth(req)
  if (!person) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  const body = await req.json()
  const { landlord_id, account_label, bank_name, account_name, sort_code, account_number, iban, swift, is_default } = body
  if (!landlord_id || !account_label || !account_name)
    return NextResponse.json({ error: 'landlord_id, account_label and account_name required' }, { status: 400 })

  const svc = service()

  // If setting as default, clear other defaults for this landlord first
  if (is_default) {
    await svc
      .from('landlord_bank_accounts')
      .update({ is_default: false })
      .eq('landlord_id', landlord_id)
  }

  const { data, error } = await svc
    .from('landlord_bank_accounts')
    .insert({ landlord_id, account_label, bank_name, account_name, sort_code, account_number, iban, swift, is_default: is_default ?? false })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ account: data })
}

export async function PUT(req: NextRequest) {
  const person = await auth(req)
  if (!person) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  const body = await req.json()
  const { id, landlord_id, account_label, bank_name, account_name, sort_code, account_number, iban, swift, is_default } = body
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  const svc = service()

  if (is_default && landlord_id) {
    await svc
      .from('landlord_bank_accounts')
      .update({ is_default: false })
      .eq('landlord_id', landlord_id)
      .neq('id', id)
  }

  const { data, error } = await svc
    .from('landlord_bank_accounts')
    .update({ account_label, bank_name, account_name, sort_code, account_number, iban, swift, is_default, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ account: data })
}

export async function DELETE(req: NextRequest) {
  const person = await auth(req)
  if (!person) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  const id = req.nextUrl.searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  const { error } = await service().from('landlord_bank_accounts').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
