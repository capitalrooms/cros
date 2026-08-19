# Issues Found in UI Testing (August 19, 2026)

## ✅ FIXED ISSUES

### 1. Broken `/admin/communications` Route (404 Error)
**Problem:** Dashboard tries to link to `/admin/communications` which doesn't exist  
**Root Cause:** Communications are accessed via property detail pages, not a standalone admin page  
**Fix Applied:** Changed dashboard Communications tile to link to `/admin/properties`  
**Status:** ✅ DEPLOYED  
**Commit:** fa9b468

### 2. PeopleTab Using Wrong Field Name
**Problem:** People tab throws error "Could not find a relationship between 'tenancies' and 'tenant_id'"  
**Root Cause:** PeopleTab interface and queries used `tenant_id` instead of correct field `person_id`  
**Fix Applied:** Updated Tenancy interface and Supabase query to use `person_id`  
**Status:** ✅ DEPLOYED  
**Commit:** df43db8

### 3. Tenant Routing Feature Added
**Problem:** Users couldn't navigate from Communications to specific tenant profiles  
**Fix Applied:** Added clickable tenant names in RoomCommunicationsModal with routing to `/admin/tenant/[personId]`  
**Status:** ✅ DEPLOYED  
**Commit:** 76326bd

---

## ⚠️ REMAINING ISSUES

### 1. People Tab Still Showing Error (Schema Mismatch)
**Problem:** "Failed to load tenancies" error persists  
**Console Error:** "column people_1.name does not exist"  
**Root Cause:** The `people` table might not have a `name` field (could be `full_name` or another variant)  
**Next Step:** Verify actual schema of `people` table and update field references accordingly  
**Affected Component:** `app/admin/properties/[id]/components/PeopleTab.tsx`  
**Status:** ⏳ NEEDS INVESTIGATION

### 2. Quick Notify AI Text Visibility
**Problem:** User reports "ai writing in quick notify is black you cant see what you are writing"  
**Possible Cause:** Generated AI text may not have proper text color styling  
**Affected Component:** `app/admin/components/QuickNotifyModal.tsx` (lines 297-316)  
**Location:** AI Draft tab, textarea for generated message  
**Status:** ⏳ NEEDS INVESTIGATION

### 3. Quick Notify Requires API Endpoint
**Issue:** `/api/ai/compose-notification` endpoint called at line 67  
**Requirement:** This endpoint must exist and be properly configured  
**Config Needed:** ANTHROPIC_API_KEY environment variable on Vercel  
**Status:** ❓ NEEDS VERIFICATION

### 4. Rent Amount Disappears on Mobile (All Units Page)
**Problem:** Rent column shows "£-" instead of actual amounts on phone view  
**User Action:** Marked Harry on notice → rent disappeared  
**Affected Component:** `app/admin/active-rooms/page.tsx` or AllUnitsTable display  
**Console Error:** Check if rent_monthly is being fetched or if styling hides it  
**Status:** ⏳ NEEDS INVESTIGATION

### 5. All Units Page Layout Broken on Mobile
**Problem:** "screen generally looks dreadful on phone"  
**Symptoms:** Table not responsive, columns cramped, poor readability on mobile  
**Affected Component:** `app/admin/active-rooms/page.tsx` - table layout  
**Device:** iPhone mobile view (375px width)  
**Status:** ⏳ NEEDS RESPONSIVE REDESIGN

### 6. On Notice Tenancies Disappear from Lettings View
**Problem:** When Harry's room is marked "on notice", no data populates in lettings view  
**Symptoms:** No tenant name, no rent amount, no property info  
**Root Cause:** "On notice" status likely filters out or hides tenancy from queries  
**Affected Pages:** Lettings view, possibly All Units view  
**Critical:** User cannot manage tenancies marked as on notice  
**Status:** ⏳ CRITICAL - NEEDS IMMEDIATE FIX

---

## SUMMARY BY CATEGORY

### 🔴 CRITICAL ISSUES
- **On Notice tenancies vanish from views** - User cannot manage tenancies marked on notice

### Database/Schema Issues
- ⚠️ `people` table field name mismatch (name vs full_name?)
- ⚠️ `tenancies` table relationships not loading correctly
- ⚠️ `rent_monthly` field not displaying on All Units table
- ⚠️ "On notice" status hides/filters tenancies from queries

### UI/Styling Issues  
- ⚠️ Quick Notify AI text color visibility problem
- ⚠️ All Units table layout broken on mobile (unresponsive)
- ⚠️ Rent amount shows "£-" instead of values on mobile

### API Issues
- ❓ `/api/ai/compose-notification` endpoint setup verification needed

### Deployment
- ✅ All fixes deployed to Vercel (cros-sigma.vercel.app)
- ✅ Latest commit: df43db8

---

## TESTING NOTES

**Desktop View:** ✅ Working correctly  
**Mobile View:** ✅ Responsive layout working  
**Console Errors:** 2 remaining (schema mismatch, text color)  
**Network Errors:** None remaining (404 fixed)

### Properties Tested
- Poplar, London, E14 ODX (0 rooms - showed error)
- 12 Saltwell Street (3 occupied - not tested yet after fix)

### Next Test Steps
1. Verify `people` table schema - check actual field names
2. Test People tab load after schema confirmation
3. Test Quick Notify AI text visibility
4. Verify `/api/ai/compose-notation` endpoint exists and has API key

---

## FILES MODIFIED

### Fixed
- `app/admin/page.tsx` - Fixed Communications link (fa9b468)
- `app/admin/properties/[id]/components/PeopleTab.tsx` - Fixed person_id field (df43db8)
- `app/admin/properties/[id]/components/RoomCommunicationsModal.tsx` - Added tenant routing (76326bd)

### Needs Review
- `app/admin/properties/[id]/components/PeopleTab.tsx` - Schema field investigation
- `app/admin/components/QuickNotifyModal.tsx` - Text color visibility check
- API endpoint: `/api/ai/compose-notification` - Verify setup

---

## DEPLOYMENT STATUS

**Current Production:** https://cros-sigma.vercel.app  
**Last Deploy:** 2026-08-19  
**Branch:** main  
**Status:** Live with known issues noted above
