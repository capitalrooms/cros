/**
 * POST /api/maintenance/scan-label
 *
 * Accepts a base64-encoded image of an appliance label.
 * Returns extracted make, model, and serial number using Claude vision.
 */

import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'

const client = new Anthropic()

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  try {
    const { imageBase64, mediaType } = await req.json()

    if (!imageBase64) {
      return NextResponse.json({ error: 'imageBase64 required' }, { status: 400 })
    }

    const response = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 300,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'image',
              source: {
                type: 'base64',
                media_type: mediaType || 'image/jpeg',
                data: imageBase64,
              },
            },
            {
              type: 'text',
              text: `This is a photo of a household appliance label or rating plate.
Extract the following information and respond ONLY with valid JSON, nothing else:
{
  "make": "manufacturer brand name, or null if not visible",
  "model": "model number/name, or null if not visible",
  "serial": "serial number, or null if not visible",
  "type": "appliance type (e.g. Washing Machine, Fridge, Oven), or null if unclear"
}

If the image is not of an appliance label, return {"make":null,"model":null,"serial":null,"type":null}.`,
            },
          ],
        },
      ],
    })

    const text = response.content[0]?.type === 'text' ? response.content[0].text : ''
    const data = JSON.parse(text)
    return NextResponse.json(data)
  } catch (err) {
    console.error('scan-label error:', err)
    // Return nulls on failure — label scan is enrichment, not blocking
    return NextResponse.json({ make: null, model: null, serial: null, type: null })
  }
}
