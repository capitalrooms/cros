/**
 * POST /api/rooms/scan-photo
 *
 * Passes a room photo to Claude vision and extracts detected features.
 * Called after a room photo is uploaded — results are offered to the user
 * for confirmation before saving to rooms.detected_features.
 *
 * Body: { photo_url: string }
 *
 * Returns: {
 *   flooring: string | null
 *   natural_light: string | null
 *   window_treatment: string | null
 *   wardrobe: string | null
 *   window_type: string | null
 *   extras: string[]
 * }
 */

import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

export async function POST(req: NextRequest) {
  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: 'ANTHROPIC_API_KEY not configured' }, { status: 500 })
  }

  const { photo_url } = await req.json()
  if (!photo_url) {
    return NextResponse.json({ error: 'photo_url required' }, { status: 400 })
  }

  const prompt = `You are helping describe a room in a shared house for a letting advert.

Look at this room photo carefully and return a JSON object with EXACTLY these keys.
Use null for anything you cannot determine from the photo. Never guess.
Only describe what is genuinely visible — do NOT downgrade features (e.g. if there is a window, describe the light quality; if there is a wardrobe, describe its type).

{
  "flooring": one of: "carpet" | "laminate" | "hardwood" | "tiles" | null,
  "natural_light": one of: "excellent natural light" | "good natural light" | "natural light" | null,
  "window_treatment": one of: "curtains" | "blinds" | "venetian blinds" | "shutters" | "no window treatment" | null,
  "wardrobe": one of: "built-in double wardrobe" | "built-in wardrobe" | "freestanding double wardrobe" | "freestanding wardrobe" | null,
  "window_type": one of: "sash windows" | "bay window" | "casement windows" | "skylights" | null,
  "extras": array of strings — any other notable positive features clearly visible (e.g. "high ceilings", "original fireplace", "exposed brick", "garden view", "ensuite bathroom"). Max 3. Empty array if none.
}

Return ONLY the raw JSON — no markdown, no explanation.`

  try {
    // Fetch the image and convert to base64 — Claude can't directly fetch
    // some external storage URLs (including Supabase), so we proxy it server-side.
    const imgRes = await fetch(photo_url)
    if (!imgRes.ok) {
      return NextResponse.json({ error: 'Could not fetch image', detail: `HTTP ${imgRes.status}` }, { status: 400 })
    }
    const contentType = (imgRes.headers.get('content-type') || 'image/jpeg').split(';')[0].trim()
    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif']
    const mediaType = allowedTypes.includes(contentType) ? contentType : 'image/jpeg'
    const arrayBuffer = await imgRes.arrayBuffer()
    const base64 = Buffer.from(arrayBuffer).toString('base64')

    const message = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 300,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'image',
              source: { type: 'base64', media_type: mediaType as any, data: base64 },
            },
            { type: 'text', text: prompt },
          ],
        },
      ],
    })

    const raw = message.content[0].type === 'text' ? message.content[0].text.trim() : '{}'

    // Strip markdown fences if model adds them
    const cleaned = raw.replace(/^```json?\s*/i, '').replace(/```\s*$/i, '').trim()
    const features = JSON.parse(cleaned)

    return NextResponse.json({ features })
  } catch (err) {
    console.error('[scan-photo]', err)
    return NextResponse.json({ error: 'Scan failed', detail: String(err) }, { status: 500 })
  }
}
