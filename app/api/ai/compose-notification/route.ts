import { NextRequest, NextResponse } from 'next/server'
import { Anthropic } from '@anthropic-ai/sdk'
import { createClient } from '@supabase/supabase-js'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const client = new Anthropic()

export async function POST(req: NextRequest) {
  const { prompt, property_id, recipient_type } = await req.json()

  if (!prompt || !property_id) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    return NextResponse.json({ error: 'AI service not configured' }, { status: 500 })
  }

  try {
    // Get property details for context
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { persistSession: false } }
    )

    const { data: property } = await supabase
      .from('properties')
      .select('address')
      .eq('id', property_id)
      .single()

    const systemPrompt = `You are a professional property manager assistant writing tenant communications.

Your tone is:
- Professional yet friendly
- Clear and concise
- Action-oriented when needed
- Respectful of tenant privacy

Format your response as JSON with exactly these fields:
{
  "subject": "The email subject line",
  "message": "The full message body"
}

The property is at: ${property?.address || 'a managed property'}
Recipients: ${recipient_type === 'all_tenants' ? 'All tenants' : recipient_type === 'cleaners' ? 'Cleaning staff' : 'Specific recipient'}

Write professional, friendly communications that inform and respect the recipient.`

    const message = await client.messages.create({
      model: 'claude-opus-4-1-20250805',
      max_tokens: 1024,
      messages: [
        {
          role: 'user',
          content: prompt
        }
      ],
      system: systemPrompt
    })

    const responseText = message.content[0].type === 'text' ? message.content[0].text : ''

    // Parse JSON response
    const jsonMatch = responseText.match(/\{[\s\S]*\}/)
    if (!jsonMatch) {
      return NextResponse.json({ error: 'Failed to parse AI response' }, { status: 500 })
    }

    const { subject, message: messageBody } = JSON.parse(jsonMatch[0])

    return NextResponse.json({
      subject: subject || 'Notification',
      message: messageBody || ''
    })
  } catch (error) {
    console.error('AI compose error:', error)
    return NextResponse.json({ error: 'Failed to generate message' }, { status: 500 })
  }
}
