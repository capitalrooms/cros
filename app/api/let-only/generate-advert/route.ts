/**
 * POST /api/let-only/generate-advert
 *
 * Drafts room copy using Claude. Two formats:
 *   format: "listing"  → full structured advert with emoji sections (Rightmove / Facebook Marketplace style)
 *   format: "group"    → short punchy WhatsApp/Facebook group post (~5-8 lines)
 *
 * When room_id + property_id are provided, fetches room and communal photos and
 * passes them to Claude as vision inputs so the copy reflects what's actually in the photos.
 *
 * Body: {
 *   format?: "listing" | "group"   (default: "listing")
 *   room_name: string
 *   room_id?: string                 — if set, fetches room photos + saved features
 *   property_id?: string             — if set, fetches communal photos
 *   monthly_rent?: number | null
 *   deposit_amount?: number | null
 *   floor_area_sqm?: number | null
 *   available_date?: string | null   (ISO date)
 *   tenancy_length?: string | null
 *   has_ensuite?: boolean | null
 *   has_shared_bathroom?: boolean | null
 *   has_lounge?: boolean | null
 *   has_washing_machine?: boolean | null
 *   has_tumble_dryer?: boolean | null
 *   detected_features?: object | null  — saved AI-detected room features
 *   notes?: string | null
 *   address: string
 *   postcode?: string | null
 * }
 */

import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@supabase/supabase-js'

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

// Service-role client to fetch photos server-side
function getServiceSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
}

async function fetchPhotoUrls(propertyId: string | null, roomId: string | null): Promise<{
  communalUrls: string[]
  roomUrls: string[]
}> {
  if (!propertyId && !roomId) return { communalUrls: [], roomUrls: [] }
  const supabase = getServiceSupabase()

  const communalUrls: string[] = []
  const roomUrls: string[] = []

  if (propertyId) {
    // Communal photos: room_id IS NULL
    const { data: communal } = await supabase
      .from('property_photos')
      .select('file_url')
      .eq('property_id', propertyId)
      .is('room_id', null)
      .not('file_url', 'is', null)
      .order('created_at', { ascending: false })
      .limit(3)
    for (const p of communal || []) if (p.file_url) communalUrls.push(p.file_url)
  }

  if (roomId) {
    const { data: roomPhotos } = await supabase
      .from('property_photos')
      .select('file_url')
      .eq('room_id', roomId)
      .not('file_url', 'is', null)
      .order('created_at', { ascending: false })
      .limit(3)
    for (const p of roomPhotos || []) if (p.file_url) roomUrls.push(p.file_url)
  }

  return { communalUrls, roomUrls }
}

function buildImageBlock(url: string): any {
  return { type: 'image', source: { type: 'url', url } }
}

export async function POST(req: NextRequest) {
  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: 'ANTHROPIC_API_KEY not configured' }, { status: 500 })
  }

  const body = await req.json()
  const {
    format = 'listing',
    room_name,
    room_id,
    property_id,
    monthly_rent,
    deposit_amount,
    floor_area_sqm,
    available_date,
    tenancy_length,
    has_ensuite,
    has_shared_bathroom,
    has_lounge,
    has_washing_machine,
    has_tumble_dryer,
    detected_features,
    notes,
    address,
    postcode,
  } = body

  // Fetch photos if IDs provided
  const { communalUrls, roomUrls } = await fetchPhotoUrls(property_id || null, room_id || null)
  const hasPhotos = communalUrls.length > 0 || roomUrls.length > 0

  const availableStr = available_date
    ? new Date(available_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
    : null

  const fullAddress = postcode ? `${address}, ${postcode}` : address

  // Build fact list
  const facts: string[] = [
    `Property: ${fullAddress}`,
    `Room: ${room_name}`,
    monthly_rent   ? `Rent: £${Number(monthly_rent).toLocaleString()} pcm` : null,
    deposit_amount ? `Deposit: £${Number(deposit_amount).toLocaleString()} (5 weeks)` : null,
    floor_area_sqm ? `Floor area: ${floor_area_sqm} m²` : null,
    availableStr   ? `Available from: ${availableStr}` : null,
    tenancy_length ? `Preferred tenancy: ${tenancy_length}` : null,
    has_ensuite === true         ? 'Has en-suite bathroom' : null,
    has_shared_bathroom === true ? 'Has shared bathroom' : null,
    has_lounge === true          ? 'Has communal lounge' : null,
    has_washing_machine === true ? 'Washing machine in property' : null,
    has_tumble_dryer === true    ? 'Tumble dryer in property' : null,
    notes ? `Additional notes: ${notes}` : null,
  ].filter(Boolean) as string[]

  // Add detected room features
  if (detected_features && typeof detected_features === 'object') {
    const df = detected_features as Record<string, any>
    if (df.flooring)          facts.push(`Flooring: ${df.flooring}`)
    if (df.natural_light)     facts.push(`Light: ${df.natural_light}`)
    if (df.window_type)       facts.push(`Windows: ${df.window_type}`)
    if (df.window_treatment)  facts.push(`Window treatment: ${df.window_treatment}`)
    if (df.wardrobe)          facts.push(`Wardrobe: ${df.wardrobe}`)
    if (Array.isArray(df.extras) && df.extras.length > 0) {
      facts.push(`Other features: ${df.extras.join(', ')}`)
    }
  }

  const factsBlock = facts.join('\n')

  const photoInstruction = hasPhotos
    ? `You have been given photos of the property. Use what you can see in the photos to make the copy specific and accurate — describe the room and communal spaces based on what is actually visible. The communal photos come first, then the room photos.`
    : ''

  let promptText: string

  if (format === 'group') {
    promptText = `You are writing a short room listing for a WhatsApp or Facebook group.

${photoInstruction}

Write a punchy, friendly post of 6–10 lines. Rules:
- Open with 2–3 key selling points and the address in one sentence
- Use occasional emoji (🏠 🛏️ 💰 📅) — keep it natural, not overwhelming
- Mention rent (if known), availability (if known), and 1–2 standout features visible in the photos or listed in the facts
- End with a call to action: "DM for info" or "Message us to book a viewing"
- Do NOT include long sections or sub-headers — keep it conversational and scannable
- If rent is not provided, skip it entirely — no placeholder
- Never downgrade features — if there is a window, say there's natural light; if there is a wardrobe, describe its type
- Write only the post text — no label, no sign-off

Facts:
${factsBlock}`
  } else {
    promptText = `You are writing a room listing advert in the style of a polished Facebook Marketplace / letting group post.

${photoInstruction}

Structure the output exactly like this (use the same emoji bullet style):

✨ [Room type] – [Address] ✨

[2-sentence intro: describe the vibe and setting of the property, referencing what you see in the photos if available]

🌟 Key Features
[4–6 bullet lines, each starting with a relevant emoji and a short description of real, specific features — from the photos and the facts list. Include flooring, light, windows, wardrobe if visible. Never downgrade: if there is a wardrobe say "built-in double wardrobe" not just "wardrobe" if it clearly is one. If there are sash windows say so. Work with what you have.]

📍 Location
[3–4 bullet lines about nearby amenities — cafés, parks, transport, shops. Only include venues you are reasonably confident exist given the postcode/address. Skip any you're uncertain about.]

💷 Details
[Bullet lines for: Rent (if known), Deposit (if provided), Available from (if known), Tenancy preference (if known)]

Rules:
- Use real, specific features — no hollow estate-agent phrases
- If rent is not provided, omit the rent bullet entirely — no placeholder
- Mention floor area naturally if provided (e.g. "Spacious double room at 14 m²")
- Mention washer/dryer under Key Features if applicable
- Write only the advert — no intro label, no sign-off

Facts:
${factsBlock}`
  }

  // Build the message content — images first, then text
  const contentBlocks: any[] = []

  if (hasPhotos) {
    if (communalUrls.length > 0) {
      contentBlocks.push({ type: 'text', text: `Communal area photos (${communalUrls.length}):` })
      for (const url of communalUrls) contentBlocks.push(buildImageBlock(url))
    }
    if (roomUrls.length > 0) {
      contentBlocks.push({ type: 'text', text: `Room photos (${roomUrls.length}):` })
      for (const url of roomUrls) contentBlocks.push(buildImageBlock(url))
    }
  }

  contentBlocks.push({ type: 'text', text: promptText })

  // Use sonnet when we have photos (vision), haiku for text-only
  const model = hasPhotos ? 'claude-sonnet-4-6' : 'claude-haiku-4-5-20251001'

  const message = await client.messages.create({
    model,
    max_tokens: 600,
    messages: [{ role: 'user', content: contentBlocks }],
  })

  const text = message.content[0].type === 'text' ? message.content[0].text.trim() : ''
  return NextResponse.json({ advert: text, photos_used: { communal: communalUrls.length, room: roomUrls.length } })
}
