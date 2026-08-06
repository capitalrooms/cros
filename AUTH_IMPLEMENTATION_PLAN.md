# 🔐 Comprehensive Authentication System – Implementation Plan

**Goal:** Multi-method login supporting passwords, passkeys, and social auth  
**Timeline:** ~3-4 hours to build and test  
**Status:** Planning phase

---

## 📋 Implementation Roadmap

### Phase 1: Email/Password (Foundation) – 30 min
- ✅ Already built but needs polish
- [ ] Fix any remaining issues from today's 404 error
- [ ] Add "forgot password" flow
- [ ] Add password validation rules
- [ ] Remember me option

### Phase 2: Passkeys/WebAuthn (Biometric) – 90 min
- [ ] Register passkey (Face ID, fingerprint, Windows Hello)
- [ ] Login with passkey
- [ ] Manage passkeys (add/remove)
- [ ] Works on: iPhone, Android, Mac, Windows

### Phase 3: Social Login – 60 min
- [ ] Sign in with Apple
- [ ] Sign in with Google
- [ ] Link social accounts to existing accounts
- [ ] Auto-create account on first social login

### Phase 4: Polish & Security – 30 min
- [ ] Session management
- [ ] Two-factor authentication (optional)
- [ ] Device management (see where logged in)
- [ ] Security audit

---

## 🔐 Authentication Methods Comparison

| Feature | Email/Password | Passkeys | Social Login |
|---------|---|---|---|
| **Setup Time** | Instant | 1 minute | 1 click |
| **Speed** | Slow (typing) | Fast (Face ID) | Fast (1 tap) |
| **Security** | Good | Excellent | Excellent |
| **Works Offline** | No | No | No |
| **Privacy** | Full control | Full control | Depends on provider |
| **Device Support** | All | iPhone/Android/Mac/Windows | All |
| **Fallback** | Yes (default) | Yes (needs password) | Yes (needs password) |

---

## 🏗️ Architecture

### Login Page Layout
```
╔════════════════════════════════════════╗
║         Capital Rooms Login            ║
║                                        ║
║  [ Email ] [ Password ]  [Sign in]     ║
║                                        ║
║  ─────── OR ───────                    ║
║                                        ║
║  [🍎 Sign in with Apple]              ║
║  [🔵 Sign in with Google]              ║
║                                        ║
║  ─────── OR ───────                    ║
║                                        ║
║  [👤 Use Passkey (Face ID)]           ║
║                                        ║
║  [Forgot password?]  [Create account]  ║
╚════════════════════════════════════════╝
```

### Database Schema
```
users (Supabase Auth)
├── id (UUID)
├── email
├── encrypted_password
├── email_confirmed_at
└── last_sign_in_at

people (Custom)
├── id (matches Supabase user.id)
├── full_name
├── email
├── role (admin, tenant, etc.)
├── avatar_url
└── created_at

passkeys (New)
├── id (UUID)
├── user_id (foreign key → users.id)
├── credential_id
├── public_key
├── counter
├── device_name ("iPhone Face ID", "Windows Hello")
├── created_at
└── last_used_at

social_accounts (New)
├── id (UUID)
├── user_id (foreign key → users.id)
├── provider ("google", "apple")
├── provider_id
├── email
├── created_at

sessions (New)
├── id (UUID)
├── user_id
├── device_name
├── ip_address
├── user_agent
├── created_at
└── expires_at
```

---

## 📱 What Users Will See

### Method 1: Email/Password (Classic)
```
Email: harry@capitalrooms.co.uk
Password: [password field]
[Sign in] [Forgot password?]
```

### Method 2: Passkey (New)
```
[Use Passkey]
→ Face ID dialog appears on phone
→ User approves with face
→ Logged in instantly
```

### Method 3: Social (Convenient)
```
[Sign in with Apple]
→ Apple login dialog
→ Biometric confirmation
→ Auto-logged in
```

---

## 🔧 Implementation Steps

### Step 1: Email/Password Bulletproofing
- [ ] Verify login works perfectly
- [ ] Add password strength requirements
- [ ] Add "forgot password" email flow
- [ ] Add password reset page
- [ ] Add "remember me" option
- [ ] Add rate limiting (prevent brute force)

### Step 2: Passkeys (WebAuthn)
```typescript
// Registration
1. User clicks "Set up Passkey"
2. Call WebAuthn API: navigator.credentials.create()
3. Face ID/Fingerprint dialog appears
4. User approves
5. Save credential to database

// Login
1. User clicks "Use Passkey"
2. Call WebAuthn API: navigator.credentials.get()
3. Face ID/Fingerprint dialog appears
4. User approves
5. Verify with server
6. User logged in
```

### Step 3: Social Login (OAuth)
```typescript
// Google OAuth
1. Redirect to Google consent screen
2. User approves
3. Google redirects back with auth code
4. Exchange code for access token
5. Get user info from Google
6. Create/update local user
7. Create session

// Apple OAuth
1. Redirect to Apple login
2. User authenticates (may include Face ID)
3. Apple redirects back
4. Same flow as Google
```

### Step 4: Session Management
```typescript
// Track device
{
  id: "session-123",
  user_id: "user-456",
  device_name: "Harry's iPhone",
  ip_address: "192.168.1.100",
  created_at: "2026-08-06T10:00:00Z",
  expires_at: "2026-09-06T10:00:00Z"
}

// User can see all active sessions
// User can revoke any session
```

---

## 🛡️ Security Measures

### Rate Limiting
- Max 5 login attempts per IP per 15 minutes
- Lock account after 10 failed attempts
- Require email verification to unlock

### Password Requirements
- Minimum 8 characters
- Must include: uppercase, lowercase, number
- Optional: special character
- Check against common passwords

### Passkey Security
- Private key never leaves device
- Public key stored on server
- Challenge-response verification
- Prevents phishing (tied to domain)

### Social Login Security
- Verify CSRF tokens
- Validate redirect URIs
- Use secure random state parameters
- Minimal permission requests

### Session Security
- HTTP-only cookies
- Secure flag (HTTPS only)
- SameSite policy
- Session timeout
- Device fingerprinting optional

---

## 📊 User Experience Flow

### First-Time User (Email/Password)
```
1. Visit /login
2. See all options
3. Choose "Email/Password"
4. Create account
5. Verify email
6. Set up passkey (optional)
7. Logged in
```

### Returning User (Passkey)
```
1. Visit /login
2. Click "Use Passkey"
3. Face ID dialog
4. Done (2 seconds)
```

### Social User (Apple)
```
1. Visit /login
2. Click "Sign in with Apple"
3. Apple prompts for Face ID
4. Done (1 click)
```

---

## 🚀 Phase-by-Phase Rollout

### Week 1: Email/Password
- Fix any remaining issues
- Test thoroughly
- Deploy

### Week 2: Passkeys
- Implement WebAuthn
- Test on iPhone, Android, Mac, Windows
- Deploy

### Week 3: Social Login
- Implement Google OAuth
- Implement Apple OAuth
- Deploy

### Week 4: Polish
- Session management UI
- Device list
- Security audit
- Final testing

---

## 📝 Files to Create

### New Pages
- [ ] `/app/login` – Enhanced login with all methods
- [ ] `/app/auth/passkey/register` – Set up passkey
- [ ] `/app/auth/passkey/authenticate` – Login with passkey
- [ ] `/app/auth/forgot-password` – Password reset
- [ ] `/app/auth/reset-password/[token]` – Reset password page
- [ ] `/app/settings/security` – Device management

### New API Routes
- [ ] `/api/auth/register` – Email registration
- [ ] `/api/auth/login` – Email login
- [ ] `/api/auth/logout` – Sign out
- [ ] `/api/auth/forgot-password` – Send reset email
- [ ] `/api/auth/reset-password` – Reset password
- [ ] `/api/auth/passkey/register-options` – WebAuthn options
- [ ] `/api/auth/passkey/register-verify` – Verify registration
- [ ] `/api/auth/passkey/login-options` – WebAuthn options
- [ ] `/api/auth/passkey/login-verify` – Verify login
- [ ] `/api/auth/google/callback` – Google OAuth callback
- [ ] `/api/auth/apple/callback` – Apple OAuth callback
- [ ] `/api/auth/sessions` – List active sessions
- [ ] `/api/auth/sessions/[id]/revoke` – End session

### Database Migrations
- [ ] Add passkeys table
- [ ] Add social_accounts table
- [ ] Add sessions table
- [ ] Add password reset tokens table

---

## 💻 Technology Stack

### Frontend
- **WebAuthn** – Browser's native biometric API
- **Next.js** – Server-side auth flows
- **Supabase Auth** – Base authentication

### Backend
- **Supabase** – User management
- **WebAuthn** – Passkey verification
- **OAuth 2.0** – Social login
- **PostgreSQL** – Custom tables

### Libraries
- **@simplewebauthn/browser** – WebAuthn on frontend
- **@simplewebauthn/server** – WebAuthn verification
- **axios** – HTTP requests
- **jose** – JWT handling

---

## ✅ Success Criteria

- [ ] Users can login with email/password
- [ ] Users can register with email
- [ ] Users can reset forgotten password
- [ ] Users can set up passkey (Face ID/fingerprint)
- [ ] Users can login with passkey
- [ ] Users can login with Apple
- [ ] Users can login with Google
- [ ] Sessions are tracked per device
- [ ] Users can see active sessions
- [ ] Users can revoke sessions
- [ ] Login is fast (< 2 seconds with passkey)
- [ ] Login is secure (no vulnerabilities)
- [ ] Login is user-friendly (clear errors)

---

## 🎯 Priority Order

**Must Have (Phase 1-2):**
1. Email/Password (solid)
2. Passkeys (Face ID/fingerprint)

**Should Have (Phase 3):**
3. Apple OAuth
4. Google OAuth

**Nice to Have (Phase 4):**
5. Two-factor authentication
6. Session management UI

---

## 📞 Questions for You

1. **Google OAuth** – Do you have a Google OAuth app set up?
2. **Apple OAuth** – Do you have an Apple OAuth app set up?
3. **Email provider** – Can users reset forgotten passwords via email?
4. **Priority** – What's most important to you?
   - [ ] Passkeys (Face ID) first
   - [ ] Social login first
   - [ ] All at once

---

## 🚀 Ready to Build?

Once you confirm the plan, I'll implement all three methods, create the UI, set up the database migrations, and test everything.

**Estimated total time: 3-4 hours**

Let me know:
1. Do you have OAuth credentials (Google/Apple)?
2. What's your priority?
3. Should I start building now?
