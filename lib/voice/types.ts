/** Voice command parsing types — each action handler implements one of these */

export type ActionType = 'room_update' | 'email_send' | 'appointment_create' | 'contractor_email' | 'batch'

export interface ParsedCommand {
  action: ActionType
  confidence: number  // 0-1; <0.7 gets confirmation asking "did you mean...?"
  summary: string     // human-readable one-liner for confirmation modal
  details: unknown    // action-specific payload
  warnings?: string[] // e.g. "Room 3 not found at this property — did you mean Room 2?"
}

export interface VoiceSessionState {
  isRecording: boolean
  transcript: string
  isLoading: boolean
  error: string | null
  commands: ParsedCommand[]
  showConfirm: boolean
}
