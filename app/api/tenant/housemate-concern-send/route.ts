/**
 * POST /api/tenant/housemate-concern-send
 * Sends a housemate concern privately to Capital Rooms admins.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { insertNotifications } from '@/lib/serverNotify'
import Anthropic from '@anthropic-ai/sdk'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function serviceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  )
}

export async function POST(req: NextRequest) {
  const { category, concern } = await req.json()
  if (!concern?.trim()) return NextResponse.json({ error: 'concern required' }, { status: 400 })

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

  // Get all admins
  const { data: admins } = await service
    .from('people')
    .select('id')
    .in('role', ['administrator', 'admin'])

  if (admins && admins.length > 0) {
    const tenantName = `${person.first_name || ''} ${person.last_name || ''}`.trim() || 'A tenant'
    const categoryLabel = category ? `[${category.replace(/_/g, ' ')}] ` : ''

    // AI summary for long concerns (>300 chars)
    let notifBody = `${categoryLabel}${concern.trim().slice(0, 200)}${concern.trim().length > 200 ? '…' : ''}`
    if (concern.trim().length > 300 && process.env.ANTHROPIC_API_KEY) {
      try {
        const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
        const msg = await anthropic.messages.create({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 120,
          messages: [{
            role: 'user',
            content: `Summarise this tenant concern in one sentence (max 160 chars), factual and neutral — no judgement. Concern: "${concern.trim()}"`,
          }],
        })
        const summary = (msg.content[0] as any).text?.trim()
        if (summary) notifBody = `${categoryLabel}${summary}`
      } catch { /* fall back to truncated raw text */ }
    }

    await insertNotifications(service, admins.map((a: any) => a.id), {
      title: `🏠 Housemate concern — ${tenantName}`,
      body: notifBody,
      type: 'housemate_concern',
      link: `/admin/people`,
    })
  }

  return NextResponse.json({ ok: true })
}
