/**
 * POST /api/maintenance/error-code-lookup
 * Interprets an appliance error code using AI.
 * Returns severity, explanation, and optional self-fix steps.
 * Always returns a result — never blocks the report submission.
 */

import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}))
  const { errorCode, applianceType, make, model } = body

  if (!errorCode?.trim()) {
    return NextResponse.json({ error: 'errorCode required' }, { status: 400 })
  }

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    return NextResponse.json({
      severity: 'unknown',
      explanation: `Error code ${errorCode} noted. Our team will look into it when they visit.`,
      self_fix_steps: null,
      escalate: false,
    })
  }

  const applianceDesc = [
    make, model, applianceType
  ].filter(Boolean).join(' ')

  const prompt = `You are a home appliance expert helping a tenant in a shared house understand an error code.

APPLIANCE: ${applianceDesc || 'Unknown appliance'}
ERROR CODE: ${errorCode.trim()}

Diagnose this error code. Be practical and honest.

Respond with ONLY valid JSON on a single line, no markdown, no code fences:
{
  "severity": "easy" | "moderate" | "serious",
  "explanation": "One clear sentence explaining what this error code means",
  "self_fix_steps": ["step 1", "step 2", ...] | null,
  "escalate": true | false,
  "escalate_reason": "Brief reason if escalate is true, otherwise null"
}

Rules:
- "easy": tenant can likely fix themselves (clean filter, reset, clear blockage, replace simple part)
- "moderate": might be fixable but needs caution (replacing a seal, clearing pump blockage)
- "serious": requires a professional (motor failure, electrical fault, gas issue, refrigerant)
- Only provide self_fix_steps if severity is "easy" or "moderate" AND the fix is genuinely safe for a non-technical person
- Keep explanation clear and non-technical
- If you don't recognise the error code, say so honestly and set escalate: true`

  try {
    const client = new Anthropic({ apiKey })
    const msg = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 500,
      messages: [{ role: 'user', content: prompt }],
    })

    const rawText = (msg.content[0] as any).text?.trim() || ''
    const jsonText = rawText
      .replace(/^```(?:json)?\s*/i, '')
      .replace(/\s*```$/, '')
      .trim()

    let result: any = {}
    try {
      result = JSON.parse(jsonText)
    } catch {
      console.error('[error-code-lookup] JSON parse failed:', rawText)
    }

    return NextResponse.json({
      severity: result.severity || 'unknown',
      explanation: result.explanation || `Error code ${errorCode} noted — our team will investigate.`,
      self_fix_steps: result.self_fix_steps || null,
      escalate: result.escalate ?? true,
      escalate_reason: result.escalate_reason || null,
    })
  } catch (err) {
    console.error('[error-code-lookup]', err)
    return NextResponse.json({
      severity: 'unknown',
      explanation: `Error code ${errorCode} noted. Our team will look into it when they visit.`,
      self_fix_steps: null,
      escalate: false,
    })
  }
}
