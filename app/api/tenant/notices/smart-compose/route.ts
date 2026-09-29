/**
 * POST /api/tenant/notices/smart-compose
 * Tenant describes what they want in plain language → AI picks type/subtype/deadline and drafts the notice.
 */

import { NextRequest, NextResponse } from 'next/server'
import { requireSignedIn } from '@/lib/portalAuth'
import Anthropic from '@anthropic-ai/sdk'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  // signed-in users only — this calls the AI (paid per use)
  if (!(await requireSignedIn(req as any))) return NextResponse.json({ error: 'Please sign in again.' }, { status: 401 })
  const { description } = await req.json()
  if (!description?.trim()) {
    return NextResponse.json({ error: 'description required' }, { status: 400 })
  }

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    // No AI key — return the description as-is so the UI still works
    return NextResponse.json({
      notice_type: 'info',
      subtype: null,
      ai_text: description.trim(),
      deadline: null,
      auto_expire_hours: null,
    })
  }

  const today = new Date().toISOString().split('T')[0]

  const prompt = `You help tenants in a shared house post notices to their communal notice board.
A tenant has described what they want to post in plain English. Determine the best notice type, write a polished notice, and extract any relevant details.

TODAY'S DATE: ${today}

TENANT'S DESCRIPTION:
"${description.trim()}"

NOTICE TYPES:
- "update": A short personal heads-up that auto-expires (guest staying, away this week, expecting delivery, back late)
- "task": Something that needs doing by housemates — stays until marked done (bins, cleaning, fix something, sign a document)
- "info": General info/announcement, no action needed (maintenance booked, inspection coming, broadband issue, house rule reminder)

SUBTYPES by type:
- update: "Guest staying over", "Away this week", "Back late tonight", "Expecting a delivery"
- task: "Clean communal area", "Take bins out", "Sign document", "Reply needed", "Action required"
- info: "General update", "Maintenance scheduled", "Inspection", "Parcel / delivery", "Reminder"

Respond with ONLY valid JSON on a single line, no markdown, no code fences. Example format:
{"notice_type":"task","subtype":"Take bins out","ai_text":"Hey everyone, could someone please take the bins out before Tuesday morning? They are completely full — thank you!","deadline":null,"auto_expire_hours":null}`

  try {
    const client = new Anthropic({ apiKey })
    const msg = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 400,
      messages: [{ role: 'user', content: prompt }],
    })

    const rawText = (msg.content[0] as any).text?.trim() || ''
    // Strip any markdown fences the model might wrap around the JSON
    const jsonText = rawText
      .replace(/^```(?:json)?\s*/i, '')
      .replace(/\s*```$/, '')
      .trim()

    let result: any = {}
    try {
      result = JSON.parse(jsonText)
    } catch {
      console.error('[smart-compose] JSON parse failed:', rawText)
    }

    return NextResponse.json({
      notice_type: result.notice_type || 'info',
      subtype: result.subtype || null,
      ai_text: result.ai_text || description.trim(),
      deadline: result.deadline || null,
      auto_expire_hours: result.auto_expire_hours || null,
    })
  } catch (err) {
    console.error('[smart-compose]', err)
    // Graceful fallback — never return a hard 500 to the client
    return NextResponse.json({
      notice_type: 'info',
      subtype: null,
      ai_text: description.trim(),
      deadline: null,
      auto_expire_hours: null,
    })
  }
}
