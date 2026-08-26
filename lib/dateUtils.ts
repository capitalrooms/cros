/**
 * Date utilities for GMT/UK time handling
 * All dates in CROS use GMT (no DST adjustments)
 */

/**
 * Get today's date in GMT as YYYY-MM-DD string
 * Used for all date comparisons
 */
export function getTodayGMT(): string {
  const now = new Date()
  const year = now.getUTCFullYear()
  const month = String(now.getUTCMonth() + 1).padStart(2, '0')
  const date = String(now.getUTCDate()).padStart(2, '0')
  return `${year}-${month}-${date}`
}

/**
 * Get a date in GMT as YYYY-MM-DD string
 */
export function getDateGMT(date: Date): string {
  const year = date.getUTCFullYear()
  const month = String(date.getUTCMonth() + 1).padStart(2, '0')
  const d = String(date.getUTCDate()).padStart(2, '0')
  return `${year}-${month}-${d}`
}

/**
 * Compare two YYYY-MM-DD date strings
 * Returns: -1 if a < b, 0 if equal, 1 if a > b
 */
export function compareDateStrings(a: string, b: string): number {
  if (a < b) return -1
  if (a > b) return 1
  return 0
}

/**
 * Check if a date string is in the past (before today in GMT)
 */
export function isDatePast(dateStr: string): boolean {
  const today = getTodayGMT()
  return dateStr < today
}

/**
 * Check if a date string is today
 */
export function isDateToday(dateStr: string): boolean {
  return dateStr === getTodayGMT()
}

/**
 * Check if a date string is in the future (after today in GMT)
 */
export function isDateFuture(dateStr: string): boolean {
  const today = getTodayGMT()
  return dateStr > today
}

/**
 * Get days until a date (negative if past)
 */
export function getDaysUntil(dateStr: string): number {
  const today = getTodayGMT()
  const todayDate = new Date(`${today}T00:00:00Z`)
  const targetDate = new Date(`${dateStr}T00:00:00Z`)
  const diffMs = targetDate.getTime() - todayDate.getTime()
  return Math.floor(diffMs / (1000 * 60 * 60 * 24))
}

/**
 * Format a date string (YYYY-MM-DD) for display in UK format
 */
export function formatDateUK(dateStr: string): string {
  const [year, month, day] = dateStr.split('-')
  const date = new Date(`${dateStr}T00:00:00Z`)
  return date.toLocaleDateString('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  })
}
