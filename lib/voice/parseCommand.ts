import { ParsedCommand } from './types'

/**
 * Parse a voice transcript into structured commands.
 * Sends to Claude with context about what's available (rooms, tenants, properties).
 * Returns one or more actions to confirm & execute.
 */
export async function parseVoiceCommand(
  transcript: string,
  context: {
    propertyId?: string
    propertyName?: string
    rooms?: { id: string; name: string; unit_code: string | null; room_type?: string | null }[]
    tenants?: { id: string; name: string; email: string; room_id: string }[]
  }
): Promise<{ commands: ParsedCommand[]; error?: string }> {
  try {
    const res = await fetch('/api/admin/voice-parse', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ transcript, context }),
    })

    if (!res.ok) {
      const err = await res.json()
      return { commands: [], error: err.error || 'Failed to parse command' }
    }

    const data = await res.json()
    return data
  } catch (e) {
    return { commands: [], error: String(e) }
  }
}

/**
 * Execute confirmed commands.
 * Each action handler knows how to turn its details into API calls.
 */
export async function executeCommands(commands: ParsedCommand[]): Promise<{
  executed: number
  failed: { command: string; error: string }[]
}> {
  const failed: { command: string; error: string }[] = []
  let executed = 0

  for (const cmd of commands) {
    try {
      if (cmd.action === 'room_update') {
        const res = await fetch(`/api/admin/voice/room-update`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(cmd.details),
        })
        if (!res.ok) throw new Error(await res.text())
        executed++
      } else if (cmd.action === 'email_send') {
        const res = await fetch(`/api/admin/voice/email-send`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(cmd.details),
        })
        if (!res.ok) throw new Error(await res.text())
        executed++
      } else if (cmd.action === 'appointment_create') {
        const res = await fetch(`/api/admin/voice/appointment-create`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(cmd.details),
        })
        if (!res.ok) throw new Error(await res.text())
        executed++
      } else if (cmd.action === 'contractor_email') {
        const res = await fetch(`/api/admin/voice/contractor-email`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(cmd.details),
        })
        if (!res.ok) throw new Error(await res.text())
        executed++
      } else {
        throw new Error(`Unknown action type: ${cmd.action}`)
      }
    } catch (e) {
      failed.push({ command: cmd.summary, error: String(e) })
    }
  }

  return { executed, failed }
}
