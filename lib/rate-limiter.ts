/**
 * Simple in-memory rate limiter
 * Tracks requests per user/IP and enforces limits
 *
 * NOTE: For production with multiple servers, use Redis
 * This is suitable for single-instance deployments
 */

interface RateLimitEntry {
  count: number
  resetAt: number
}

interface RateLimitConfig {
  maxRequests: number
  windowMs: number // milliseconds
}

const DEFAULT_CONFIG: RateLimitConfig = {
  maxRequests: 100,
  windowMs: 60000, // 1 minute
}

// Store: { "key": { count, resetAt } }
const store = new Map<string, RateLimitEntry>()

// Cleanup old entries every 5 minutes
setInterval(() => {
  const now = Date.now()
  for (const [key, entry] of store.entries()) {
    if (entry.resetAt < now) {
      store.delete(key)
    }
  }
}, 5 * 60 * 1000)

/**
 * Check if a request should be rate limited
 * @param identifier - Unique identifier (user ID, IP, etc.)
 * @param config - Rate limit configuration
 * @returns true if rate limit exceeded, false if allowed
 */
export function isRateLimited(
  identifier: string,
  config: Partial<RateLimitConfig> = {}
): boolean {
  const fullConfig = { ...DEFAULT_CONFIG, ...config }
  const now = Date.now()
  const key = `rl:${identifier}`

  let entry = store.get(key)

  if (!entry || entry.resetAt < now) {
    // New window
    store.set(key, {
      count: 1,
      resetAt: now + fullConfig.windowMs,
    })
    return false
  }

  // Within existing window
  entry.count++
  return entry.count > fullConfig.maxRequests
}

/**
 * Get current rate limit info
 */
export function getRateLimitInfo(
  identifier: string,
  config: Partial<RateLimitConfig> = {}
): {
  remaining: number
  resetAt: number
  isLimited: boolean
} {
  const fullConfig = { ...DEFAULT_CONFIG, ...config }
  const now = Date.now()
  const key = `rl:${identifier}`

  const entry = store.get(key)

  if (!entry || entry.resetAt < now) {
    return {
      remaining: fullConfig.maxRequests,
      resetAt: now + fullConfig.windowMs,
      isLimited: false,
    }
  }

  return {
    remaining: Math.max(0, fullConfig.maxRequests - entry.count),
    resetAt: entry.resetAt,
    isLimited: entry.count > fullConfig.maxRequests,
  }
}

/**
 * SMS Rate Limiting: 5 per hour per user
 */
export const SMS_LIMITS = {
  maxRequests: 5,
  windowMs: 60 * 60 * 1000, // 1 hour
}

/**
 * Email Rate Limiting: 10 per hour per user
 */
export const EMAIL_LIMITS = {
  maxRequests: 10,
  windowMs: 60 * 60 * 1000, // 1 hour
}

/**
 * API Rate Limiting: 100 per minute per IP
 */
export const API_LIMITS = {
  maxRequests: 100,
  windowMs: 60 * 1000, // 1 minute
}

/**
 * Generate a response for rate limit exceeded
 */
export function getRateLimitResponse(resetAt: number) {
  const resetSeconds = Math.ceil((resetAt - Date.now()) / 1000)
  return {
    error: 'Rate limit exceeded',
    retryAfter: Math.max(1, resetSeconds),
    resetAt: new Date(resetAt).toISOString(),
  }
}
