# API Route Security Checklist

**Use this checklist when adding security to new API routes.**

---

## Pre-Implementation

- [ ] Identify the route: `/api/path/to/route`
- [ ] Identify the HTTP method(s): POST / GET / PUT / DELETE
- [ ] List all input parameters (from body, query, headers)
- [ ] List all ID fields that need validation

---

## Step 1: Add Imports

```typescript
import { getCurrentUser } from '@/lib/auth'
import { logAudit, getClientIp } from '@/lib/auditLog'
import { validateUUID, validateEmail, validateNotes, validatePhoneNumber } from '@/lib/validation'
```

✅ Checklist:
- [ ] getCurrentUser imported
- [ ] logAudit and getClientIp imported
- [ ] Appropriate validators imported (see validator list below)

---

## Step 2: Authentication Check

```typescript
export async function POST(request: NextRequest) {
  const user = await getCurrentUser()
  if (!user) {
    await logAudit({ 
      userId: 'unknown', 
      action: 'security_unauthorized_access', 
      details: 'Unauthorized access to [endpoint-name]', 
      ipAddress: getClientIp(request.headers) 
    })
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
```

✅ Checklist:
- [ ] Check for `!user` early in function
- [ ] Log unauthorized attempts
- [ ] Return 401 status code
- [ ] Include endpoint name in log details

**Special Cases:**
- Dev-only routes: Add `if (process.env.NODE_ENV === 'production') { ... }`
- Webhook routes: Use shared secret validation instead of getCurrentUser
- Public routes: Skip this step entirely

---

## Step 3: Authorization Check (if needed)

```typescript
  // For admin-only endpoints
  if (user.assignment?.role !== 'administrator') {
    await logAudit({
      userId: user.id,
      action: 'security_forbidden_access',
      details: `Role '${user.assignment?.role}' attempted access`,
      ipAddress: getClientIp(request.headers)
    })
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  // For role-based access
  if (!['admin', 'cleaner', 'agent'].includes(user.assignment?.role)) {
    await logAudit({
      userId: user.id,
      action: 'security_forbidden_access',
      details: `Role '${user.assignment?.role}' attempted access`,
      ipAddress: getClientIp(request.headers)
    })
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
```

✅ Checklist:
- [ ] Check user.assignment?.role if role-based
- [ ] Log forbidden attempts with role name
- [ ] Return 403 status code
- [ ] Check this AFTER authentication check

---

## Step 4: Extract and Validate Input

```typescript
  const body = await request.json()
  const { ticketId, propertyId, email, notes } = body

  // Validate each field
  if (!ticketId || !validateUUID(ticketId)) {
    await logAudit({
      userId: user.id,
      action: 'security_invalid_input',
      details: `Invalid ticketId: ${ticketId}`,
      ipAddress: getClientIp(request.headers)
    })
    return NextResponse.json({ error: 'Invalid ticketId format' }, { status: 400 })
  }

  if (!email || !validateEmail(email)) {
    await logAudit({
      userId: user.id,
      action: 'security_invalid_input',
      details: `Invalid email: ${email}`,
      ipAddress: getClientIp(request.headers)
    })
    return NextResponse.json({ error: 'Invalid email' }, { status: 400 })
  }

  if (!notes || !validateNotes(notes)) {
    await logAudit({
      userId: user.id,
      action: 'security_invalid_input',
      details: 'Invalid notes (XSS detected)',
      ipAddress: getClientIp(request.headers)
    })
    return NextResponse.json({ error: 'Invalid content' }, { status: 400 })
  }
```

✅ Checklist for each field:
- [ ] Field is required? Check for truthiness
- [ ] Is it an ID? Use `validateUUID()`
- [ ] Is it an email? Use `validateEmail()`
- [ ] Is it free text? Use `validateNotes()`
- [ ] Is it a phone? Use `validatePhoneNumber()`
- [ ] Is it a date? Use `validateDateISO()`
- [ ] Log validation failure with details
- [ ] Return 400 status code
- [ ] Include field name in error message

---

## Step 5: Business Logic

```typescript
  // Your existing logic here
  const result = await supabase.from('table').insert({ ... })
  
  if (result.error) {
    return NextResponse.json({ error: result.error }, { status: 500 })
  }
```

✅ Checklist:
- [ ] No changes needed to existing business logic
- [ ] Just wrap it between validation and logging

---

## Step 6: Success Audit Log

```typescript
  // After successful action
  await logAudit({
    userId: user.id,
    action: 'create',  // or 'update', 'delete', 'send', etc.
    table: 'table_name',  // optional: which table was affected
    recordId: result.id,  // optional: ID of created/modified record
    details: `Created ticket #${result.id} for property ${propertyId}`,
    ipAddress: getClientIp(request.headers)
  })

  return NextResponse.json({ success: true, id: result.id })
```

✅ Checklist:
- [ ] Log action name matches what happened
- [ ] Include relevant details
- [ ] Include record ID if available
- [ ] Include IP address
- [ ] Return 200 with result

---

## Validator Reference

Use these validators from `/lib/validation.ts`:

| Function | Input | Purpose | Example |
|----------|-------|---------|---------|
| `validateUUID(value)` | string | Check UUID format | IDs, property_id, etc. |
| `validateEmail(value)` | string | Check email format | user emails |
| `validatePhoneNumber(value)` | string | Check phone format | contact numbers |
| `validateNotes(value)` | string | Check for XSS, max 5000 chars | description, content |
| `validateDateISO(value)` | string | Check YYYY-MM-DD format | dates (validates Feb 30 → false) |
| `validateAmount(value)` | string/number | Check numeric currency | prices, costs |
| `validateRole(value)` | string | Check against valid roles | role validation |

---

## Common Patterns

### Pattern 1: Simple POST with ID + Content

```typescript
export async function POST(request: NextRequest) {
  const user = await getCurrentUser()
  if (!user) return unauthorized()

  const { ticketId, notes } = await request.json()
  
  if (!ticketId || !validateUUID(ticketId)) return badRequest('Invalid ticketId')
  if (!notes || !validateNotes(notes)) return badRequest('Invalid notes')

  const result = await db.insert(ticketId, notes)
  
  await logAudit({ userId: user.id, action: 'create', details: '...', ipAddress: getClientIp(request.headers) })
  return NextResponse.json({ success: true })
}
```

### Pattern 2: GET with UUID Parameter

```typescript
export async function GET(request: NextRequest) {
  const user = await getCurrentUser()
  if (!user) return unauthorized()

  const { searchParams } = new URL(request.url)
  const propertyId = searchParams.get('propertyId')

  if (!propertyId || !validateUUID(propertyId)) return badRequest('Invalid propertyId')

  const data = await db.query(propertyId)
  
  await logAudit({ userId: user.id, action: 'read', details: '...', ipAddress: getClientIp(request.headers) })
  return NextResponse.json({ data })
}
```

### Pattern 3: Email Validation

```typescript
const { email } = await request.json()
if (!email || !validateEmail(email)) {
  await logAudit({ userId: user.id, action: 'security_invalid_input', details: `Invalid email: ${email}`, ipAddress: getClientIp(request.headers) })
  return NextResponse.json({ error: 'Invalid email' }, { status: 400 })
}
```

### Pattern 4: Multiple ID Parameters

```typescript
const { propertyId, roomId, ticketId } = await request.json()

if (!propertyId || !validateUUID(propertyId)) return badRequest('Invalid propertyId')
if (!roomId || !validateUUID(roomId)) return badRequest('Invalid roomId')
if (!ticketId || !validateUUID(ticketId)) return badRequest('Invalid ticketId')
```

---

## Testing Your Route

### 1. Unauthenticated Request
```bash
curl -X POST http://localhost:3000/api/your-route -H "Content-Type: application/json" -d '{"id": "test"}'
# Expected: 401 Unauthorized
```

### 2. Invalid UUID
```bash
curl -X POST http://localhost:3000/api/your-route \
  -H "Cookie: auth-token=..." \
  -H "Content-Type: application/json" \
  -d '{"id": "not-a-uuid"}'
# Expected: 400 Bad Request
```

### 3. Valid Request
```bash
curl -X POST http://localhost:3000/api/your-route \
  -H "Cookie: auth-token=..." \
  -H "Content-Type: application/json" \
  -d '{"id": "550e8400-e29b-41d4-a716-446655440000"}'
# Expected: 200 OK with result
```

### 4. Check Audit Logs
```bash
# In Supabase, query audit_logs table
SELECT * FROM audit_logs WHERE action = 'security_invalid_input' ORDER BY created_at DESC
# Should see your test attempts logged
```

---

## Before Submitting

- [ ] All 6 steps completed
- [ ] Build passes: `npm run build`
- [ ] No new TypeScript errors
- [ ] Tested manually with curl/Postman
- [ ] Audit logs appear in Supabase
- [ ] All validators applied to relevant fields
- [ ] No breaking changes to API response format

---

## Troubleshooting

**Build Error: "not defined"**
→ Check imports at top of file

**Build Error: "Cannot find module"**
→ Verify import paths are correct (use @/lib/...)

**Route returns 401 for logged-in users**
→ Check getCurrentUser() is working (test /api/dev/test-session)

**Validation failing when data looks valid**
→ Check exact format expected (UUID with hyphens, email with @, etc.)

**Audit logs not appearing**
→ Check SUPABASE_SERVICE_ROLE_KEY is set in .env

---

**Questions?** Reference the completed examples:
- `/app/api/notify-viewing-scheduled/route.ts` - Complex multi-recipient notification
- `/app/api/property-notes/route.ts` - GET + POST with different validations
- `/app/api/push/send/route.ts` - Multiple optional parameters
