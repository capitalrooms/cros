import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData()
    const file = formData.get('file') as File | null
    const storageUrl = formData.get('storage_url') as string | null

    if (!file && !storageUrl) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 })
    }

    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

    let documentSource: any

    if (storageUrl) {
      // Fetch from storage and convert to base64
      const res = await fetch(storageUrl)
      if (!res.ok) throw new Error(`Failed to fetch file: ${res.status}`)
      const buffer = await res.arrayBuffer()
      const base64 = Buffer.from(buffer).toString('base64')
      const mimeType = (formData.get('mime_type') as string) || 'application/pdf'
      documentSource = {
        type: 'base64' as const,
        media_type: mimeType as any,
        data: base64,
      }
    } else {
      const buffer = await file!.arrayBuffer()
      const base64 = Buffer.from(buffer).toString('base64')
      const mimeType = file!.type || 'application/pdf'
      documentSource = {
        type: 'base64' as const,
        media_type: mimeType as any,
        data: base64,
      }
    }

    const response = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1024,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'document',
              source: documentSource,
            },
            {
              type: 'text',
              text: `Extract all factual property information from this document that tenants would find useful day-to-day.

Return ONLY a JSON array of items. Each item must have:
- "icon": a single relevant emoji
- "label": short name (e.g. "WiFi Name", "Bin Day", "Heating")
- "value": the actual information (can be multi-line for complex info)
- "sensitive": true only for passwords, PIN codes, or key safe codes

Focus on extracting:
- WiFi network name and password (separate items)
- WiFi provider name and contact
- Bin collection day and any recycling info
- Heating system instructions
- Fuse box location
- Stopcock location
- Utility company names and phone numbers (gas, electric, water)
- Emergency contacts (name + number)
- Cleaner name
- Locksmith details
- Council contact
- Fire evacuation instructions
- Any other practical property facts

Do NOT include: landlord/company registration numbers, membership bodies, legal text, property management company details, or generic advice.

Return only valid JSON array, no explanation, no markdown fences.`,
            },
          ],
        },
      ],
    })

    const raw = response.content[0].type === 'text' ? response.content[0].text.trim() : ''

    // Strip any accidental markdown fences
    const cleaned = raw.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```\s*$/i, '').trim()

    let items: any[]
    try {
      items = JSON.parse(cleaned)
      if (!Array.isArray(items)) throw new Error('Not an array')
    } catch {
      return NextResponse.json({ error: 'Could not parse extracted data', raw }, { status: 422 })
    }

    // Validate and sanitise each item
    const sanitised = items
      .filter((it: any) => it && typeof it === 'object' && it.label && it.value)
      .map((it: any) => ({
        icon: typeof it.icon === 'string' ? it.icon.slice(0, 4) : '📌',
        label: String(it.label).slice(0, 80),
        value: String(it.value).slice(0, 500),
        sensitive: !!it.sensitive,
      }))

    return NextResponse.json({ items: sanitised })
  } catch (err: any) {
    console.error('[house-info-extract]', err)
    return NextResponse.json({ error: err.message || 'Extraction failed' }, { status: 500 })
  }
}
