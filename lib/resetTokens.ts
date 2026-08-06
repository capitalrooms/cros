// Reset token store (for dev purposes - in production use database)
export const resetTokens = new Map<string, { email: string; createdAt: number }>()

export function getResetToken(token: string) {
  return resetTokens.get(token)
}

export function markTokenUsed(token: string) {
  resetTokens.delete(token)
}

export function createResetToken(email: string): string {
  const crypto = require('crypto')
  const token = crypto.randomBytes(32).toString('hex')
  const now = Date.now()

  // Store token with expiry (1 hour)
  resetTokens.set(token, { email, createdAt: now })

  // Clean up old tokens
  for (const [key, value] of resetTokens.entries()) {
    if (now - value.createdAt > 3600000) {
      resetTokens.delete(key)
    }
  }

  return token
}
