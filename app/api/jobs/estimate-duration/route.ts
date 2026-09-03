/**
 * POST { ticketId }
 *
 * Asks Claude to estimate how long a maintenance job will take based on the
 * job title, category, and description. Stores the result in the DB and
 * returns it so the contractor can see it as a soft guide — they are not
 * held to it and real jobs often run over.
 *
 * Idempotent: if the job already has a duration_estimate_label, returns
 * the cached value immediately without calling the AI again.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import Anthropic from '@anthropic-ai/sdk'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 30

function aiConfigured() {
  return !!process.env.ANTHROPIC_API_KEY
}

export async function POST(req: NextRequest) {
  // No user-session auth needed — gated by ticketId (UUID); result is non-sensitive.


  const { ticketId } = await req.json()
  if (!ticketId) return NextResponse.json({ error: 'ticketId required' }, { status: 400 })

  const service = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const { data: ticket, error } = await service
    .from('maintenance_tickets')
    .select('id, title, category, description, duration_estimate_label, duration_estimate_minutes')
    .eq('id', ticketId)
    .single()

  if (error || !ticket) {
    return NextResponse.json({ error: 'Ticket not found' }, { status: 404 })
  }

  // Return cached value if already estimated
  if (ticket.duration_estimate_label) {
    return NextResponse.json({
      label: ticket.duration_estimate_label,
      minutes: ticket.duration_estimate_minutes,
      cached: true,
    })
  }

  if (!aiConfigured()) {
    return NextResponse.json(
      { error: 'AI not configured — ANTHROPIC_API_KEY missing' },
      { status: 503 }
    )
  }

  const prompt = `You are a UK property maintenance expert. Estimate how long the following repair job will take a professional tradesperson to complete on-site.

Job title: ${ticket.title}
Category: ${ticket.category || 'General'}
${ticket.description ? `Description: ${ticket.description}` : ''}

Respond with JSON only — no other text:
{
  "label": "30–45 minutes",   // human-readable range shown to contractor
  "minutes": 40               // midpoint integer for sorting/scheduling
}

Be realistic. A simple boiler bleed is 15 min; replacing a tap is 45–60 min; painting a room is 3–4 hrs. If genuinely uncertain, err slightly generous. Never exceed 8 hours for a single visit.`

  try {
    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! })
    const msg = await anthropic.messages.create({
      model: process.env.AI_MODEL || 'claude-haiku-4-5-20251001',
      max_tokens: 128,
      messages: [{ role: 'user', content: prompt }],
    })

    const raw = (msg.content[0] as any)?.text?.trim() || ''
    // Strip markdown code fence if present
    const jsonStr = raw.replace(/^```[a-z]*\n?/i, '').replace(/\n?```$/i, '').trim()
    const result = JSON.parse(jsonStr)

    const label: string = result.label || ''
    const minutes: number = typeof result.minutes === 'number' ? result.minutes : null

    // Store for future calls
    if (label) {
      await service
        .from('maintenance_tickets')
        .update({ duration_estimate_label: label, duration_estimate_minutes: minutes })
        .eq('id', ticketId)
    }

    return NextResponse.json({ label, minutes, cached: false })
  } catch (err) {
    // Don't surface AI failures to the contractor — just return nothing
    console.error('Duration estimate error:', err)
    return NextResponse.json({ label: null, minutes: null, error: 'estimate_failed' })
  }
}
