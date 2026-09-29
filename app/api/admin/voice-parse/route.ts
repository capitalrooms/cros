import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { requireAdmin } from '@/lib/adminAuth'

export const maxDuration = 30

const PARSE_SYSTEM_PROMPT = `You are parsing voice commands for a property management system. Extract structured actions from natural language.

Available action types:
- room_update: Update room details (size, type, features)
- email_send: Send emails to tenants (one, multiple, or all at property)
- appointment_create: Book viewings or appointments (lettings only for now)

For each command, return a JSON object with:
{
  "action": "room_update" | "email_send" | "appointment_create",
  "confidence": 0.0-1.0,
  "summary": "human readable one-liner",
  "details": { action-specific data },
  "warnings": ["optional warnings if ambiguous"]
}

Room details that can be updated: room_type (e.g. "double room", "ensuite"), size ("small", "medium", "large"), description.

Emails (tenants): Parse recipient (tenant name, "all tenants at X property", "room X at property Y"), subject, message body.

Contractor/supplier emails: Parse contractor/landlord name, property, job type (if mentioned), subject, and body. Can reference active jobs or search by name.

Appointments: Parse type (viewing, inspection, maintenance, delivery), property name, date (exact or relative like "tomorrow"), time (12/24 hour or am/pm), room (optional), and title. Extract as title: "Viewing - [person/property]" or "Inspection at [property]".

Examples:
INPUT: "room 3 at 71 alloa road is a medium sized double room with a large ensuite"
OUTPUT: {
  "action": "room_update",
  "confidence": 0.95,
  "summary": "Update Room 3: medium double with large ensuite",
  "details": {
    "roomName": "room 3",
    "propertyName": "71 alloa road",
    "updates": {
      "room_type": "double",
      "size": "medium",
      "description": "large ensuite"
    }
  }
}

INPUT: "send an email to all tenants at willis saying I will be there tomorrow at 2pm to change a lightbulb on the first floor"
OUTPUT: {
  "action": "email_send",
  "confidence": 0.92,
  "summary": "Email all tenants at Willis: maintenance notice re: lightbulb tomorrow 2pm",
  "details": {
    "propertyName": "Willis",
    "recipients": "all",
    "subject": "Maintenance: Lightbulb replacement tomorrow at 2pm",
    "body": "I will be at the property tomorrow at 2pm to change a lightbulb on the first floor. Please ensure access is available."
  }
}

INPUT: "remind the tenant in room 3 that their room must be aerated for at least 10 minutes a day"
OUTPUT: {
  "action": "email_send",
  "confidence": 0.88,
  "summary": "Email tenant in Room 3: aeration reminder",
  "details": {
    "roomName": "room 3",
    "recipients": "tenant",
    "subject": "Room care: Daily aeration reminder",
    "body": "Please remember to air your room for at least 10 minutes each day. This helps prevent condensation and keeps the room fresh."
  },
  "warnings": ["Tenant name not provided — will be looked up by room"]
}

INPUT: "book a viewing for 3:30pm on October 3rd at Willis property"
OUTPUT: {
  "action": "appointment_create",
  "confidence": 0.94,
  "summary": "Book viewing: Willis property on Oct 3 at 3:30pm",
  "details": {
    "type": "viewing",
    "propertyName": "Willis",
    "dateStr": "2026-10-03",
    "timeStr": "15:30",
    "title": "Viewing - Willis property"
  }
}

INPUT: "schedule an inspection for tomorrow at 2pm"
OUTPUT: {
  "action": "appointment_create",
  "confidence": 0.85,
  "summary": "Schedule inspection tomorrow at 2pm",
  "details": {
    "type": "inspection",
    "dateStr": "tomorrow",
    "timeStr": "14:00",
    "title": "Inspection"
  },
  "warnings": ["Property not specified — will use current property context"]
}

INPUT: "email Mike the plumber confirming he's doing the kitchen refit at Willis"
OUTPUT: {
  "action": "contractor_email",
  "confidence": 0.92,
  "summary": "Email Mike (plumber) confirming kitchen refit at Willis",
  "details": {
    "recipientType": "contractor_by_name",
    "contractorName": "Mike",
    "propertyName": "Willis",
    "jobType": "plumbing",
    "subject": "Kitchen refit confirmation - Willis property",
    "body": "Hi Mike,\n\nJust confirming that you'll be carrying out the kitchen refit at Willis property as discussed.\n\nPlease let me know if you need any additional information or have any questions.\n\nThanks,\nCapital Rooms"
  }
}

INPUT: "request EICR from the electrician at Crownfield Road"
OUTPUT: {
  "action": "contractor_email",
  "confidence": 0.88,
  "summary": "Email electrician: request EICR at Crownfield Road",
  "details": {
    "recipientType": "job_contractor",
    "propertyName": "Crownfield Road",
    "jobType": "EICR",
    "subject": "EICR certification needed - Crownfield Road",
    "body": "Hi,\n\nCould you please arrange an EICR (Electrical Installation Condition Report) for our property at Crownfield Road?\n\nPlease let me know your availability and any costs involved.\n\nThank you,\nCapital Rooms",
    "includePropertyDetails": true
  }
}

Rules:
- If property or room is mentioned but not found in context, include in warnings
- Confidence <0.7 means ambiguous (return anyway; UI will ask for confirmation)
- Extract as much detail as possible but don't hallucinate what wasn't said
- For dates like "tomorrow", keep as-is (API will resolve to actual date)
- Always return valid JSON in a code block`;

export async function POST(req: NextRequest) {
  if (!(await requireAdmin(req))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { transcript, context } = await req.json()

  if (!transcript || typeof transcript !== 'string') {
    return NextResponse.json({ error: 'Transcript required' }, { status: 400 })
  }

  try {
    const client = new Anthropic()

    const contextStr = [
      context?.propertyName ? `Property: ${context.propertyName}` : null,
      context?.rooms?.length
        ? `Rooms: ${context.rooms.map((r) => `${r.unit_code || r.name}${r.room_type ? ` (${r.room_type})` : ''}`).join(', ')}`
        : null,
      context?.tenants?.length ? `Tenants: ${context.tenants.map((t) => `${t.name} in room ${t.room_id}`).join(', ')}` : null,
    ]
      .filter(Boolean)
      .join('\n')

    const message = await client.messages.create({
      model: 'claude-opus-5-5',
      max_tokens: 1024,
      system: PARSE_SYSTEM_PROMPT,
      messages: [
        {
          role: 'user',
          content: `Context:\n${contextStr || 'No context provided'}\n\nVoice transcript: "${transcript}"`,
        },
      ],
    })

    const responseText =
      message.content[0]?.type === 'text' ? message.content[0].text : ''

    // Extract JSON from code block or raw response
    const jsonMatch = responseText.match(/```(?:json)?\n?([\s\S]*?)\n?```/) || responseText.match(/\[[\s\S]*?\]/)

    if (!jsonMatch) {
      return NextResponse.json(
        { error: 'Could not parse Claude response', details: responseText },
        { status: 500 }
      )
    }

    const jsonStr = jsonMatch[1] || jsonMatch[0]
    const parsed = JSON.parse(jsonStr)

    // Ensure it's an array of commands
    const commands = Array.isArray(parsed) ? parsed : [parsed]

    return NextResponse.json({ commands })
  } catch (e) {
    console.error('Voice parse error:', e)
    return NextResponse.json({ error: String(e), commands: [] }, { status: 500 })
  }
}
