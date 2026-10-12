// Two-step sign-in, enforced on the server (12 Oct 2026): someone who has set up an authenticator app must have
// entered its code this sign-in (the session token says "aal2") before any office or app route accepts them.
// Screens ask for the code (components/TwoStepCode); this stops a stolen password getting in by skipping them.
export function secondStepMissing(user: { factors?: Array<{ status: string }> | null } | null | undefined, token: string): boolean {
  if (!(user?.factors ?? []).some(f => f.status === 'verified')) return false
  try {
    const claims = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString('utf8'))
    return claims.aal !== 'aal2'
  } catch { return true }
}
