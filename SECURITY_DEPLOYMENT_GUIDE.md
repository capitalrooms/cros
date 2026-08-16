# CROS Security Hardening - Deployment Guide

**Date:** 2026-08-13  
**Status:** READY TO DEPLOY  
**Priority:** 🔴 CRITICAL - Must complete before any production use

---

## WHAT HAS BEEN CREATED

### ✅ Security Files Ready in Repo

1. **Input Validation Library** - `lib/validation.ts`
   - 18+ validators for email, phone, dates, amounts, notes, URLs, UUIDs, etc.
   - Prevents SQL injection, XSS, and bad data
   - Ready to integrate into all forms

2. **Audit Logging Utility** - `lib/auditLog.ts`
   - Easy-to-use functions for logging user actions
   - Functions: logAudit, logLoginAttempt, logDataCreate, logDataUpdate, logDataDelete, etc.
   - Ready to integrate into all API routes

3. **Database Migrations** - `supabase/migrations/022-030`
   - 022: Create tenancies table
   - 023: Fix cleaner table schema
   - 024: Create pending cleaner notes table
   - 025: Create compliance logs table
   - 026: Create tenant self-checks table
   - 027: Create tenant acknowledgment notes table
   - 028: Auto-attach pending notes trigger
   - **029: CRITICAL - Restrictive RLS policies (replaces permissive ones)**
   - **030: CRITICAL - Audit logging table**

---

## IMMEDIATE ACTIONS REQUIRED

### STEP 1: Deploy Database Migrations (30-60 minutes)

**Option A: Via Supabase CLI (Recommended)**
```bash
cd /Users/boo/Documents/Claude/cros
npx supabase login  # If needed
npx supabase db push
```

**Option B: Via Supabase Web Console**
1. Go to: https://supabase.com → cros-dev project → SQL Editor
2. Create new query for each migration file in order:
   - 022_create_tenancies_table.sql
   - 023_fix_cleaner_table_schema.sql
   - 024_create_pending_cleaner_notes.sql
   - 025_create_compliance_logs.sql
   - 026_create_tenant_self_checks.sql
   - 027_create_tenant_acknowledgment_notes.sql
   - 028_auto_attach_pending_cleaner_notes.sql
   - 029_fix_rls_policies_critical.sql ⚠️ CONFIRM DESTRUCTIVE OPERATIONS
   - 030_create_audit_logs.sql

**Migration Files Location:**
```
/Users/boo/Documents/Claude/cros/supabase/migrations/
  022_create_tenancies_table.sql
  023_fix_cleaner_table_schema.sql
  024_create_pending_cleaner_notes.sql
  025_create_compliance_logs.sql
  026_create_tenant_self_checks.sql
  027_create_tenant_acknowledgment_notes.sql
  028_auto_attach_pending_cleaner_notes.sql
  029_fix_rls_policies_critical.sql
  030_create_audit_logs.sql
```

### STEP 2: Verify RLS Policies Are Active (15 minutes)

After migrations deploy, verify by testing access control:

```sql
-- Test 1: Check RLS is enabled on key tables
SELECT * FROM pg_tables WHERE schemaname='public' AND tablename='audit_logs';

-- Test 2: Verify admin can see audit logs
SELECT * FROM audit_logs LIMIT 1;

-- Test 3: Verify a tenant cannot access other tenants' data
-- (This must be tested with different user roles logged in)
```

### STEP 3: Add Input Validation to All Forms (4-6 hours)

**Files to update:**
- [ ] `/app/lettings/page.tsx` - validateEmail, validatePhoneNumber, validateDateISO
- [ ] `/app/admin/property-notes/page.tsx` - validateNotes
- [ ] `/app/cleaner/page.tsx` - validateDateISO, validateCheckType
- [ ] `/app/admin/compliance-logs/page.tsx` - validateCheckType, validateNotes
- [ ] All API routes in `/app/api/` - validate all request bodies

**Pattern to follow:**
```typescript
import { validateEmail, validatePhoneNumber, validateNotes } from '@/lib/validation'

// In your form handler:
const handleSubmit = async (data) => {
  // Validate all inputs first
  if (!validateEmail(data.email)) {
    setError('Invalid email format')
    return
  }
  
  if (!validatePhoneNumber(data.phone)) {
    setError('Invalid phone number')
    return
  }
  
  // Then proceed with submission
  const { data: result, error } = await supabase
    .from('table_name')
    .insert([{ email: data.email, phone: data.phone }])
}
```

### STEP 4: Add Auth Checks to All API Routes (2-3 hours)

**All files in `/app/api/`**

**Pattern to follow:**
```typescript
import { getCurrentUser } from '@/lib/auth'
import { logAudit, getClientIp } from '@/lib/auditLog'

export async function POST(request: Request) {
  // 1. Verify authentication
  const user = await getCurrentUser()
  if (!user) {
    return new Response('Unauthorized', { status: 401 })
  }
  
  // 2. Verify authorization (role check)
  if (user.assignment?.role !== 'administrator') {
    return new Response('Forbidden', { status: 403 })
  }
  
  // 3. Validate input
  const data = await request.json()
  if (!validateEmail(data.email)) {
    return new Response('Invalid email', { status: 400 })
  }
  
  // 4. Perform action
  const { data: result, error } = await supabase
    .from('maintenance_tickets')
    .insert([{ ...data }])
  
  // 5. Log the action
  await logAudit({
    userId: user.id,
    action: 'create',
    table: 'maintenance_tickets',
    recordId: result[0].id,
    details: `Created ticket for ${data.issue_type}`,
    ipAddress: getClientIp(request.headers),
  })
  
  return Response.json({ success: true })
}
```

### STEP 5: Run `npm audit` and Update Dependencies (30-45 minutes)

```bash
cd /Users/boo/Documents/Claude/cros
npm audit
npm audit fix
npm audit fix --force  # If needed for critical issues
```

---

## SECURITY CHECKLIST

### This Week (CRITICAL)
- [ ] Deploy migrations 022-030 to Supabase
- [ ] Test RLS restrictions (cross-tenant access blocked)
- [ ] Add input validation to 5+ form handlers
- [ ] Add auth checks to 3+ API routes
- [ ] Run npm audit and fix vulnerabilities

### Next Week (HIGH)
- [ ] Add audit logging to all sensitive operations
- [ ] Add rate limiting to API endpoints
- [ ] Review Vercel environment variables
- [ ] Complete validation on ALL forms (not just critical ones)
- [ ] Complete auth checks on ALL API routes

### Before Production (CRITICAL)
- [ ] Security testing: 4 test scenarios (see below)
- [ ] Monitor audit_logs table for suspicious activity
- [ ] Set up automated backups
- [ ] Final security review

---

## SECURITY TEST SCENARIOS

### Test 1: Tenant Cannot See Other Tenant's Data
1. Sign in as tenant1@example.com
2. Query: `SELECT * FROM tenancies`
3. Result: Should only see own tenancy (or query fails with RLS error)
4. ✅ PASS if tenant1 cannot see tenant2's data

### Test 2: Contractor Cannot See Other Contractor's Jobs
1. Sign in as contractor1@example.com
2. Query: `SELECT * FROM maintenance_tickets`
3. Result: Should only return contractor1's tickets
4. ✅ PASS if contractor1 cannot see contractor2's jobs

### Test 3: Input Validation Prevents XSS
1. In property notes form, enter: `<script>alert('hacked')</script>`
2. Save the note
3. Refresh and view the note
4. Result: Script should be escaped/displayed as text, not executed
5. ✅ PASS if no alert appears

### Test 4: Audit Logs Track Actions
1. Create a new maintenance ticket
2. Query: `SELECT * FROM audit_logs WHERE action='create' ORDER BY created_at DESC LIMIT 1`
3. Result: Should see entry with user_id, action, table_name, record_id
4. ✅ PASS if audit log exists with correct data

---

## WHAT EACH FILE DOES

### lib/validation.ts
- **Purpose:** Validate user input to prevent injection attacks
- **Key Functions:**
  - `validateEmail(email)` - Checks email format, max 255 chars
  - `validatePhoneNumber(phone)` - Accepts E.164 and UK formats
  - `validateDateISO(date)` - Validates YYYY-MM-DD and checks date is valid
  - `validateNotes(notes, maxLength)` - Checks no HTML/scripts, max length
  - `validateAmount(amount, maxAmount)` - Validates numeric values with decimals
  - `validateRole(role)` - Validates against allowed roles
  - `sanitizeText(text)` - Removes dangerous HTML/scripts
  
### lib/auditLog.ts
- **Purpose:** Log user actions for security monitoring
- **Key Functions:**
  - `logAudit(event)` - Generic audit log
  - `logLoginAttempt(userId, success, ipAddress)` - Track login attempts
  - `logDataCreate(userId, table, recordId, details)` - Log record creation
  - `logDataUpdate(userId, table, recordId, changes)` - Log updates
  - `logDataDelete(userId, table, recordId, details)` - Log deletions
  - `logSensitiveOperation(userId, operation, resourceId)` - Log sensitive access
  - `logSecurityEvent(userId, issue, details)` - Log security issues
  - `getClientIp(headers)` - Extract client IP from request headers
  - `getUserAgent(headers)` - Extract user agent from headers

### Migrations 029 & 030
- **Migration 029:** Restrictive RLS policies
  - Replaces permissive (allow all) policies with least-privilege policies
  - Tenants can only see their own data
  - Contractors can only see their own jobs
  - Cleaners can only see their own cleans
  - Admins see appropriate data by role
  - **WITHOUT THIS: Any authenticated user can access all data**

- **Migration 030:** Audit logging table
  - Tracks who did what, when, from where (IP address)
  - Essential for breach detection and compliance
  - Only admins can read (RLS policy included)

---

## MONITORING & MAINTENANCE

### Daily (First 2 Weeks After Deployment)
```sql
-- Check for suspicious activity
SELECT user_id, action, COUNT(*) as attempts
FROM audit_logs
WHERE created_at > NOW() - INTERVAL '1 hour'
GROUP BY user_id, action
HAVING COUNT(*) > 10;

-- Monitor failed login attempts
SELECT ip_address, COUNT(*) as attempts
FROM audit_logs
WHERE action = 'login_failed'
  AND created_at > NOW() - INTERVAL '1 hour'
GROUP BY ip_address
ORDER BY attempts DESC;
```

### Monthly
```bash
npm audit fix  # Update vulnerable dependencies
```

### Quarterly
- Review RLS policies for completeness
- Test all security scenarios
- Review audit logs for patterns
- Update security documentation

---

## DEPLOYMENT ORDER

**MUST be done in this order:**

1. **Deploy Migrations 022-028** (create tables)
   - Tenancies table
   - Fix cleaner schema
   - Pending notes, compliance logs, self-checks, ack notes
   - Auto-attach trigger

2. **Deploy Migration 029** (RLS policies) ⚠️ CRITICAL
   - Confirm destructive operations
   - Verify no errors

3. **Deploy Migration 030** (audit logging)
   - Creates audit_logs table and indexes
   - Sets up RLS for audit logs

4. **Update Code** (validation + auth checks)
   - Add to forms
   - Add to API routes
   - Test thoroughly

5. **Run npm audit**
   - Fix all high/critical vulnerabilities

---

## KNOWN ISSUES & SOLUTIONS

### "column tenant_id does not exist" Error
- **Cause:** Migration 029 tried to run before Migration 022
- **Solution:** Deploy migrations in order (022-028 first, then 029-030)

### RLS Policy Not Blocking Access
- **Cause:** RLS not enabled on table or policy is permissive
- **Solution:** Migration 029 fixes this - ensure it's deployed
- **Verify:** `ALTER TABLE table_name ENABLE ROW LEVEL SECURITY;`

### Audit Logs Not Recording
- **Cause:** Audit logging not added to API routes
- **Solution:** Import and call logAudit() in your API handlers

---

## QUICK START (If Starting Fresh)

```bash
# 1. Deploy migrations
cd /Users/boo/Documents/Claude/cros
npx supabase db push

# 2. Check npm vulnerabilities
npm audit

# 3. Add validation to one form as test
# Edit: /app/lettings/page.tsx
# Add validation for email, phone, date

# 4. Add auth check to one API route
# Edit: /app/api/notify-viewing-scheduled/route.ts
# Add getCurrentUser() check

# 5. Test in dev environment
npm run dev

# 6. Verify audit logs are recording
# Check Supabase dashboard → SQL Editor
# SELECT * FROM audit_logs ORDER BY created_at DESC LIMIT 10;
```

---

## SUPPORT

**If deployment fails:**
1. Check the exact error message
2. Run migrations one at a time to isolate the issue
3. Verify table dependencies (do earlier migrations exist?)
4. Check Supabase documentation: https://supabase.com/docs

**If you have questions:**
- Refer to `cros-security-audit.md` for detailed explanations
- Check `security-critical-actions.md` for code examples
- Review migration SQL files in `/supabase/migrations/`

---

## SUMMARY

This security hardening work is **NON-NEGOTIABLE** before production. It protects:
- 💰 Tenant payments & financial data
- 👥 Personal information  
- 🔑 Access control data
- 📍 Contractor locations

**Timeline:**
- Week 1: Deploy migrations (029-030 are critical)
- Week 1-2: Add validation and auth checks
- Week 2: Run npm audit and update dependencies
- Before launch: Security testing + monitoring setup

**Status:** All code is written and ready. You only need to deploy and integrate.

**Next Step:** Deploy migrations 022-030 to your Supabase database.
