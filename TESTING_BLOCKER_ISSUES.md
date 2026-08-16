# Testing Blocker Issues - URGENT

**Date:** August 13, 2026  
**Priority:** CRITICAL - Blocks admin testing  
**Impact:** Cannot verify admin workflows (job assignment, approval, compliance management)

---

## Issue 1: Admin Session Expires on Page Navigation

**What Happens:**
1. Admin logs in successfully ✅
2. Admin dashboard loads with all 12 sections visible ✅
3. Admin clicks on "Properties & Rooms" link ✅
4. Navigation starts
5. **Login page appears** ❌ Session lost

**Where It Happens:**
- `/admin/properties` - Session expires
- `/admin/maintenance` - 404/405 errors (API missing)
- Likely affects: `/admin/tenancies`, `/admin/compliance`, etc.

**Root Cause (Hypothesis):**
- Sub-pages have auth checks that fail
- Either checking for wrong role value
- Or RLS policies blocking the authenticated admin
- Or session token not being passed correctly

**Evidence:**
- Admin dashboard checks role and succeeds (shows "Welcome, Administrator")
- Admin can see all dashboard sections
- Clicking into sub-page causes logout
- Suggests auth is good at main level but fails at sub-page level

---

## Issue 2: Missing or Broken Admin API Endpoints

**What Happens:**
- Click "All Maintenance" section
- Page shows loading spinner
- Console shows errors:
  - `405 Method Not Allowed` - Server rejected the request method
  - `404 Not Found` - Resource doesn't exist
  - Multiple similar errors

**Affected Endpoints:**
- `/api/admin/maintenance` - Likely doesn't exist
- `/api/admin/properties` - Likely doesn't exist
- Possibly others

**Root Cause:**
- Admin sub-pages need backend APIs to fetch data
- These APIs haven't been implemented yet
- Frontend tries to fetch, gets 404/405, page breaks

---

## What to Fix (Priority Order)

### BLOCKER 1: Admin Sub-Page Auth
**File:** Likely `/app/admin/[section]/page.tsx` files
**Fix:** Add same auth check that works in `/app/admin/page.tsx`
```javascript
// This check works in /app/admin/page.tsx
if (data.assignment?.role !== 'administrator' && data.assignment?.role !== 'admin') {
  router.push('/login')
  return
}

// Ensure ALL admin sub-pages have this same check
// And ensure role values are consistent everywhere
```

**Why It Matters:** Admin can't verify any sub-workflows without this working

### BLOCKER 2: Implement Missing Admin APIs
**Files to create:**
- `/app/api/admin/properties/route.ts` - GET list of properties
- `/app/api/admin/maintenance/route.ts` - GET maintenance tickets
- `/app/api/admin/tenancies/route.ts` - GET tenant assignments
- etc.

**Why It Matters:** Frontend pages need data to display

**Quick Fix Pattern:**
```typescript
// app/api/admin/properties/route.ts
import { getCurrentUser } from '@/lib/auth'
import { createClient } from '@/lib/supabase'

export async function GET() {
  const user = await getCurrentUser()
  if (!user) return new Response('Unauthorized', { status: 401 })
  if (user.assignment?.role !== 'administrator' && user.assignment?.role !== 'admin') {
    return new Response('Forbidden', { status: 403 })
  }

  const supabase = createClient()
  const { data } = await supabase.from('properties').select('*')
  return Response.json(data)
}
```

---

## Testing Impact

### Can't Test
- ❌ Admin viewing all properties
- ❌ Admin assigning contractors
- ❌ Admin approving jobs
- ❌ Admin managing compliance
- ❌ Admin viewing maintenance tickets

### Can Test
- ✅ Admin login/dashboard
- ✅ Cleaner workflows (already done)
- ✅ Tenant login (basic)

---

## Workaround (If You Want to Continue Testing Today)

**Option A: Skip admin workflows for now**
- Focus on testing: Contractor, Tenant, Landlord, Lettings
- Come back to admin after fixing these issues

**Option B: Investigate the auth issue quickly**
1. Check `/app/admin/[section]/page.tsx` files
2. Look for `getCurrentUser()` and role checks
3. Ensure they match `/app/admin/page.tsx` exactly
4. Look for any RLS policy issues blocking the query

---

## Next Session

**When you have time, fix in this order:**
1. Check all admin sub-pages for auth checks (15 min)
2. Add missing auth to any that lack it (30 min)
3. Create stub API routes for admin endpoints (1 hour)
4. Test admin workflows again (30 min)
5. Resume testing other user roles

---

## Files Likely Affected

**Pages:**
- `/app/admin/properties/page.tsx`
- `/app/admin/maintenance/page.tsx`
- `/app/admin/tenancies/page.tsx`
- `/app/admin/compliance/page.tsx`
- `/app/admin/property-notes/page.tsx`
- Others in `/app/admin/`

**APIs (Missing):**
- Need entire `/app/api/admin/` directory with routes for:
  - properties
  - maintenance
  - tenancies
  - compliance
  - etc.

---

**Testing Status:** BLOCKED on admin workflows  
**Recommendation:** Fix these issues before continuing admin testing  
**Estimated Fix Time:** 2-3 hours total
