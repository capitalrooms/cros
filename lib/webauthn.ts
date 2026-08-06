/**
 * WebAuthn utilities for passkey registration and authentication
 * Supports: Face ID, Fingerprint, Windows Hello, Security Keys
 */

import {
  startRegistration,
  startAuthentication,
} from '@simplewebauthn/browser'

export interface PasskeyCredential {
  id: string
  publicKey: string
  credentialId: string
  counter: number
  deviceName: string
  createdAt: string
  lastUsedAt: string
}

/**
 * Start the passkey registration process
 * Shows Face ID / Fingerprint dialog to user
 */
export async function registerPasskey(userEmail: string, userName: string) {
  try {
    // Step 1: Get registration options from server
    const optionsRes = await fetch('/api/auth/passkey/register-options', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: userEmail, displayName: userName }),
    })

    if (!optionsRes.ok) {
      throw new Error('Failed to get registration options')
    }

    const options = await optionsRes.json()

    // Step 2: Prompt user for Face ID / Fingerprint
    const credential = await startRegistration(options)

    // Step 3: Send credential to server for verification
    const verifyRes = await fetch('/api/auth/passkey/register-verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: userEmail,
        credential,
      }),
    })

    if (!verifyRes.ok) {
      const error = await verifyRes.json()
      throw new Error(error.error || 'Failed to verify passkey')
    }

    const result = await verifyRes.json()
    return { success: true, message: 'Passkey registered successfully!' }
  } catch (error) {
    console.error('Passkey registration error:', error)
    throw error
  }
}

/**
 * Start the passkey authentication process
 * Shows Face ID / Fingerprint dialog to user
 */
export async function authenticateWithPasskey() {
  try {
    // Step 1: Get authentication options from server
    const optionsRes = await fetch('/api/auth/passkey/login-options', {
      method: 'POST',
    })

    if (!optionsRes.ok) {
      throw new Error('Failed to get authentication options')
    }

    const options = await optionsRes.json()

    // Step 2: Prompt user for Face ID / Fingerprint
    const assertion = await startAuthentication(options)

    // Step 3: Send assertion to server for verification
    const verifyRes = await fetch('/api/auth/passkey/login-verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ assertion }),
    })

    if (!verifyRes.ok) {
      const error = await verifyRes.json()
      throw new Error(error.error || 'Passkey authentication failed')
    }

    const result = await verifyRes.json()
    return { success: true, user: result.user, message: 'Logged in with passkey!' }
  } catch (error) {
    console.error('Passkey authentication error:', error)
    throw error
  }
}

/**
 * Check if device supports passkeys
 */
export async function isPasskeySupported(): Promise<boolean> {
  if (!window.PublicKeyCredential) {
    return false
  }

  // Check if device can create/get credentials
  const available = await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable()
  return available
}

/**
 * Get user-friendly device name based on browser/OS
 */
export function getDeviceName(): string {
  const ua = navigator.userAgent

  if (ua.includes('iPhone') || ua.includes('iPad')) {
    return 'Apple Device'
  } else if (ua.includes('Android')) {
    return 'Android Device'
  } else if (ua.includes('Windows')) {
    return 'Windows PC'
  } else if (ua.includes('Macintosh')) {
    return 'Mac'
  } else if (ua.includes('Linux')) {
    return 'Linux'
  }

  return 'Device'
}

