/**
 * Email send action handler.
 * Parses email commands and validates recipients.
 */

export type EmailRecipientType = 'tenant' | 'all_at_property' | 'tenants_list'

export interface EmailSendDetails {
  recipientType: EmailRecipientType
  roomName?: string              // for single tenant
  propertyName?: string          // for all_at_property
  recipients?: string[]          // for tenants_list (email addresses)
  subject: string
  body: string
}

export function validateEmailSend(
  details: EmailSendDetails,
  tenants: { id: string; name: string; email: string; room_id: string }[] = [],
  rooms: { id: string; name: string }[] = []
): {
  valid: boolean
  recipientIds?: string[]
  recipientEmails?: string[]
  error?: string
  warnings?: string[]
} {
  const warnings: string[] = []

  if (!details.subject || !details.body) {
    return { valid: false, error: 'Subject and body required' }
  }

  if (details.recipientType === 'tenant') {
    if (!details.roomName) {
      return { valid: false, error: 'Room name required for tenant email' }
    }

    // Find tenant in this room
    const room = rooms.find(
      (r) =>
        r.name?.toLowerCase().includes(details.roomName!.toLowerCase()) ||
        r.id === details.roomName
    )

    if (!room) {
      return {
        valid: false,
        error: `Room not found: ${details.roomName}`,
      }
    }

    const tenant = tenants.find((t) => t.room_id === room.id)
    if (!tenant) {
      return { valid: false, error: `No tenant found in ${room.name}` }
    }

    return {
      valid: true,
      recipientIds: [tenant.id],
      recipientEmails: [tenant.email],
    }
  }

  if (details.recipientType === 'all_at_property') {
    if (!details.propertyName) {
      return { valid: false, error: 'Property name required' }
    }

    // This is validated at parse time since we have property context
    // Filter tenants (would be done based on property context in parse)
    // For now just collect all
    const allEmails = tenants.map((t) => t.email)
    const allIds = tenants.map((t) => t.id)

    if (allEmails.length === 0) {
      warnings.push('No tenants found at this property')
    }

    return {
      valid: true,
      recipientIds: allIds,
      recipientEmails: allEmails,
      warnings: warnings.length > 0 ? warnings : undefined,
    }
  }

  if (details.recipientType === 'tenants_list') {
    if (!details.recipients || details.recipients.length === 0) {
      return { valid: false, error: 'No recipients provided' }
    }

    return {
      valid: true,
      recipientEmails: details.recipients,
    }
  }

  return { valid: false, error: 'Invalid recipient type' }
}
