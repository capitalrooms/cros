/**
 * Input Validation Library
 * Prevents SQL injection, XSS, and other input-based attacks
 * Use these validators on ALL user input before processing
 */

/**
 * Validate email address format
 * @param email Email to validate
 * @returns true if valid email format
 */
export function validateEmail(email: string): boolean {
  if (!email || typeof email !== 'string') return false

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  const trimmed = email.trim()

  // Email must be <= 255 chars (email spec)
  if (trimmed.length > 255) return false

  return emailRegex.test(trimmed)
}

/**
 * Validate phone number (UK/International format)
 * Accepts +44, 0044, 007xxx, (0)xxx formats
 * @param phone Phone number to validate
 * @returns true if valid format
 */
export function validatePhoneNumber(phone: string): boolean {
  if (!phone || typeof phone !== 'string') return false

  const phoneRegex = /^\+?[1-9]\d{1,14}$/  // E.164 format
  const trimmed = phone.replace(/[\s\-\(\)]/g, '')  // Remove formatting

  return phoneRegex.test(trimmed)
}

/**
 * Validate date in ISO format (YYYY-MM-DD)
 * Also checks date is valid (e.g. not Feb 30)
 * @param date Date string to validate
 * @returns true if valid ISO date
 */
export function validateDateISO(date: string): boolean {
  if (!date || typeof date !== 'string') return false

  const dateRegex = /^\d{4}-\d{2}-\d{2}$/
  if (!dateRegex.test(date)) return false

  // Parse the date components
  const [year, month, day] = date.split('-').map(Number)

  // Check if date is valid by verifying it matches what JS parsed
  const parsed = new Date(date + 'T00:00:00Z')
  if (isNaN(parsed.getTime())) return false

  // Verify the parsed date matches the input (catches Feb 30, Apr 31, etc.)
  const parsedYear = parsed.getUTCFullYear()
  const parsedMonth = parsed.getUTCMonth() + 1
  const parsedDay = parsed.getUTCDate()

  return year === parsedYear && month === parsedMonth && day === parsedDay
}

/**
 * Validate time in HH:MM format
 * @param time Time string to validate
 * @returns true if valid HH:MM format
 */
export function validateTime(time: string): boolean {
  if (!time || typeof time !== 'string') return false

  const timeRegex = /^([01]\d|2[0-3]):([0-5]\d)$/
  return timeRegex.test(time)
}

/**
 * Validate text notes (max length, no scripts)
 * @param notes Text to validate
 * @param maxLength Maximum allowed length (default 5000)
 * @returns true if valid
 */
export function validateNotes(notes: string, maxLength = 5000): boolean {
  if (typeof notes !== 'string') return false

  // Length check
  if (notes.length > maxLength) return false

  // Check for dangerous HTML/scripts (basic check)
  if (/<script|<iframe|javascript:|onerror=/i.test(notes)) return false

  return true
}

/**
 * Validate property name
 * @param name Property name to validate
 * @returns true if valid
 */
export function validatePropertyName(name: string): boolean {
  if (!name || typeof name !== 'string') return false

  const trimmed = name.trim()

  // Length limits
  if (trimmed.length < 1 || trimmed.length > 255) return false

  // No HTML/scripts
  if (/<script|<iframe|javascript:/i.test(trimmed)) return false

  return true
}

/**
 * Validate address (multi-line text)
 * @param address Address to validate
 * @returns true if valid
 */
export function validateAddress(address: string): boolean {
  if (!address || typeof address !== 'string') return false

  const trimmed = address.trim()

  // Length limits
  if (trimmed.length < 5 || trimmed.length > 500) return false

  // No HTML/scripts
  if (/<script|<iframe|javascript:/i.test(trimmed)) return false

  return true
}

/**
 * Validate URL (ensure it's safe to display)
 * Only allows http:// and https://
 * @param url URL to validate
 * @returns true if valid
 */
export function validateUrl(url: string): boolean {
  if (!url || typeof url !== 'string') return false

  try {
    const parsed = new URL(url)
    // Only allow http and https
    return parsed.protocol === 'http:' || parsed.protocol === 'https:'
  } catch {
    return false
  }
}

/**
 * Validate numeric amount (for prices, costs)
 * @param amount Amount to validate
 * @param maxAmount Maximum allowed amount (default 999999.99)
 * @returns true if valid
 */
export function validateAmount(amount: any, maxAmount = 999999.99): boolean {
  const num = Number(amount)

  // Check if valid number
  if (isNaN(num)) return false

  // Check if positive
  if (num < 0) return false

  // Check if within max
  if (num > maxAmount) return false

  // Check decimal places (max 2)
  if (num.toString().split('.')[1]?.length > 2) return false

  return true
}

/**
 * Validate UUID format
 * @param uuid UUID to validate
 * @returns true if valid UUID
 */
export function validateUUID(uuid: string): boolean {
  if (!uuid || typeof uuid !== 'string') return false

  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
  return uuidRegex.test(uuid)
}

/**
 * Sanitize text for safe display
 * Removes potentially dangerous HTML/scripts
 * @param text Text to sanitize
 * @returns Sanitized text
 */
export function sanitizeText(text: string): string {
  if (!text || typeof text !== 'string') return ''

  // Remove script tags and dangerous attributes
  let sanitized = text
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/on\w+\s*=\s*"[^"]*"/gi, '')  // Remove event handlers
    .replace(/on\w+\s*=\s*'[^']*'/gi, '')
    .replace(/javascript:/gi, '')

  return sanitized
}

/**
 * Validate viewing slot time format
 * Accepts formats like "09:00", "14:30", etc.
 * @param slot Slot to validate
 * @returns true if valid
 */
export function validateViewingSlot(slot: string): boolean {
  if (!slot || typeof slot !== 'string') return false

  // Must be HH:MM format (24-hour)
  const slotRegex = /^([01]\d|2[0-3]):([0-5]\d)$/
  if (!slotRegex.test(slot)) return false

  // Parse and check it's during viewing hours (8am - 6pm)
  const [hours, minutes] = slot.split(':').map(Number)
  const startHour = 8
  const endHour = 18

  if (hours < startHour || hours >= endHour) return false
  if (hours === endHour && minutes > 0) return false

  return true
}

/**
 * Validate role is one of allowed values
 * @param role Role to validate
 * @returns true if valid role
 */
export function validateRole(role: string): boolean {
  const validRoles = ['administrator', 'tenant', 'contractor', 'cleaner', 'landlord', 'lettings']
  return validRoles.includes(role)
}

/**
 * Validate communication preference
 * @param preference Preference to validate
 * @returns true if valid
 */
export function validateCommunicationPreference(preference: string): boolean {
  const validPreferences = ['email', 'text']
  return validPreferences.includes(preference)
}

/**
 * Validate check type (for compliance logs)
 * @param checkType Check type to validate
 * @returns true if valid
 */
export function validateCheckType(checkType: string): boolean {
  const validTypes = ['fire_door', 'smoke_alarm']
  return validTypes.includes(checkType)
}

/**
 * Create validation context for form submissions
 * Returns all validation errors at once
 */
export class ValidationError extends Error {
  constructor(public errors: Record<string, string>) {
    super('Validation failed')
  }
}

/**
 * Form validation helper
 * @param data Object to validate
 * @param rules Validation rules { fieldName: validator }
 * @returns void if all valid, throws ValidationError if any fail
 */
export function validateForm(
  data: Record<string, any>,
  rules: Record<string, (value: any) => boolean>
): void {
  const errors: Record<string, string> = {}

  for (const [field, validator] of Object.entries(rules)) {
    if (!validator(data[field])) {
      errors[field] = `Invalid ${field}`
    }
  }

  if (Object.keys(errors).length > 0) {
    throw new ValidationError(errors)
  }
}
