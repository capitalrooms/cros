# Critical Security Fixes - In Progress

**Priority:** 🔴 BLOCKING FOR 70+ USERS  
**Date Started:** 2026-08-14  
**Status:** IN PROGRESS

---

## Fix #1: RLS Policy Audit & Hardening

### Current Issue
Many tables have permissive RLS policies with `WITH CHECK (true)` = anyone can insert/update

### Examples Found
```sql
-- ❌ DANGEROUS - Anyone can insert
CREATE POLICY "System can insert logs" ON compliance_logs
FOR INSERT WITH CHECK (true);

-- ❌ DANGEROUS - Anyone can create
CREATE POLICY "System can insert logs" ON tenant_self_checks  
FOR INSERT WITH CHECK (true);
```

### Affected Tables
- [x] compliance_logs (037)
- [x] tenant_self_checks (038)
- [x] tenant_acknowledgment_notes (039)
- [ ] maintenance_diagnostic_attempts (036)
- [ ] maintenance_tickets
- [ ] cleans
- [ ] viewings
- [ ] properties
- [ ] tenancies

---

## Fix #2: Admin Page Access Guards

### Issue
Admin pages might not properly redirect unauthenticated users

### Pages to Harden
- [ ] /admin/* - All pages must check role
- [ ] /lettings/* - Must check lettings role
- [ ] /cleaner/* - Must check cleaner role
- [ ] /contractor/* - Must check contractor role

### Required Pattern
```typescript
// Every page must have this:
async function init() {
  const user = await getCurrentUser()
  
  // Check role EARLY
  if (!user || user.assignment?.role !== 'expected_role') {
    router.push('/login')
    return
  }
  
  // Only then proceed with data fetching
}
```

---

## Fix #3: Input Validation

### Issue
No validation on text inputs - can accept huge strings, special chars, etc.

### Forms to Protect
- [ ] Acknowledgment note title + message
- [ ] Property notes
- [ ] Maintenance description
- [ ] Cleaner notes
- [ ] Safety check issue descriptions
- [ ] Viewing visitor name/email

### Required Validation
```typescript
// Example: Title field
title.length < 255 // max length
/^[a-zA-Z0-9\s\-.,!?'"()]+$/.test(title) // safe chars
```

---

## Fix #4: Rate Limiting

### Issue
No rate limiting on:
- SMS sends
- Email sends
- API endpoints

### Required Limits
- SMS: 5 per user per hour
- Email: 10 per user per hour
- API: 100 requests per IP per minute

---

## Next Steps

1. **RLS Audit** (This turn)
   - [ ] Review all migration files for permissive policies
   - [ ] Create fixed migration
   - [ ] Test with multi-account scenarios

2. **Admin Guards** (Next)
   - [ ] Add role checks to all protected pages
   - [ ] Test unauthorized access (should redirect)

3. **Input Validation** (Following)
   - [ ] Add Zod schemas for all forms
   - [ ] Sanitize before display

4. **Rate Limiting** (Final)
   - [ ] Add middleware or library
   - [ ] Configure limits per endpoint

