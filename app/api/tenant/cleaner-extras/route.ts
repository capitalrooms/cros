/**
 * POST /api/tenant/cleaner-extras
 * Tenant submits a list of extra cleaning tasks for an upcoming clean.
 *
 * Body: { cleanId, tasks: string[], notes?: string }
 *
 * GET /api/tenant/cleaner-extras?cleanId=...
 * Returns existing request for this clean (if any).
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { insertNotifications } from '@/lib/serverNotify'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function serviceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  )
}

export async function GET(req: NextRequest) {
  const cleanId = req.nextUrl.searchParams.get('cleanId')
  if (!cleanId) return NextResponse.json({ error: 'cleanId required' }, { status: 400 })

  const authHeader = req.headers.get('Authorization') || ''
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null
  if (!token) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  const service = serviceClient()
  const { data: authData } = await service.auth.getUser(token)
  if (!authData?.user?.email) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  const { data: person } = await service
    .from('people')
    .select('id')
    .eq('email', authData.user.email)
    .single()
  if (!person) return NextResponse.json({ error: 'Person not found' }, { status: 404 })

  const { data, error } = await service
    .from('cleaner_extras_requests')
    .select('*')
    .eq('clean_id', cleanId)
    .eq('tenant_person_id', person.id)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ request: data })
}

export async function POST(req: NextRequest) {
  const { cleanId, tasks, notes } = await req.json()

  if (!cleanId || !Array.isArray(tasks) || tasks.length === 0) {
    return NextResponse.json({ error: 'cleanId and at least one task required' }, { status: 400 })
  }

  const authHeader = req.headers.get('Authorization') || ''
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null
  if (!token) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  const service = serviceClient()
  const { data: authData } = await service.auth.getUser(token)
  if (!authData?.user?.email) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  const { data: person } = await service
    .from('people')
    .select('id, first_name, last_name')
    .eq('email', authData.user.email)
    .single()
  if (!person) return NextResponse.json({ error: 'Person not found' }, { status: 404 })

  // Verify the clean exists and get property info
  const { data: clean, error: cleanErr } = await service
    .from('cleans')
    .select('id, clean_date, property_id, cleaner_id, properties(name)')
    .eq('id', cleanId)
    .single()
  if (cleanErr || !clean) return NextResponse.json({ error: 'Clean not found' }, { status: 404 })

  // Upsert — replace any existing request for this tenant+clean
  const { data: existing } = await service
    .from('cleaner_extras_requests')
    .select('id')
    .eq('clean_id', cleanId)
    .eq('tenant_person_id', person.id)
    .maybeSingle()

  let result
  if (existing?.id) {
    const { data, error } = await service
      .from('cleaner_extras_requests')
      .update({ tasks, notes: notes?.trim() || null, status: 'pending' })
      .eq('id', existing.id)
      .select()
      .single()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    result = data
  } else {
    const { data, error } = await service
      .from('cleaner_extras_requests')
      .insert({ clean_id: cleanId, tenant_person_id: person.id, tasks, notes: notes?.trim() || null })
      .select()
      .single()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    result = data
  }

  // Notify admin
  try {
    const { data: admins } = await service
      .from('people')
      .select('id')
      .in('role', ['administrator', 'admin'])

    if (admins && admins.length > 0) {
      const tenantName = `${person.first_name || ''} ${person.last_name || ''}`.trim() || 'A tenant'
      const propName = (clean.properties as any)?.name ?? 'a property'
      const taskList = tasks.slice(0, 3).join(', ') + (tasks.length > 3 ? ` +${tasks.length - 3} more` : '')
      await insertNotifications(service, admins.map((a: any) => a.id), {
        title: `🧹 Cleaner extras request — ${propName}`,
        body: `${tenantName} has requested: ${taskList}`,
        type: 'cleaner_extras_request',
        link: `/admin/maintenance`,
      })
    }

    // Notify the cleaner assigned to this clean
    if (clean.cleaner_id) {
      await insertNotifications(service, [clean.cleaner_id], {
        title: '🧹 Extra cleaning requested',
        body: `A tenant has requested extras for the ${(clean.properties as any)?.name ?? 'property'} clean: ${tasks.slice(0, 2).join(', ')}${tasks.length > 2 ? '…' : ''}`,
        type: 'cleaner_extras_request',
        link: `/cleaner`,
      })
    }
  } catch (e) {
    console.error('Failed to notify about cleaner extras:', e)
  }

  return NextResponse.json({ ok: true, request: result })
}
