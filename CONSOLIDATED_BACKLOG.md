# CROS Consolidated Backlog (19 Aug 2026)

**Current Session Progress:**
- ✅ Lettings notification templates: 17 templates seeded to database
- ✅ Feature B built: Admin Quick Notify Lettings category (5 viewing options)
- ✅ Feature C built: Time shift API (push all viewings back 15/30/60 min)
- ✅ New APIs: `quick-notify-lettings` and `viewings/time-shift`

**Ready to Deploy:** Lettings features are production-ready

---

## 🔴 CRITICAL (BLOCKER)

### Issue #1: On Notice Tenancies Disappear from Views
**Status:** 🔴 CRITICAL - Blocks lettings management  
**Problem:** When tenancy marked "on_notice", data disappears from lettings view  
**Impact:** User cannot manage tenancies in transition  
**Files Affected:**
- `app/admin/properties/[id]/components/UnitsTab.tsx` (line 166)
- `app/lettings/page.tsx` (viewing list queries)
**Root Cause:** Query filters only `end_date IS NULL`, excludes `status = 'on_notice'`  
**Fix Applied:** Changed to `.or('end_date.is.null,status.eq.on_notice')`  
**Status:** ✅ ALREADY FIXED (verify in production)

---

## ⚠️ HIGH PRIORITY (This Session)

### Feature #1: Lettings Tab Quick Notify (Phase 2)
**Status:** 🔄 READY TO BUILD  
**What:** "📢 Notify Tenants" button on each viewing card  
**Use Case:** Lettings staff notify about viewing without leaving diary view  
**Scope:**
- Add button to viewing card
- Mini quick-notify modal with template selector
- Recipients: "All Tenants" / "Specific Tenant"
- Templates: Single viewing, running late, confirmation
**Est. Time:** ~30 min  
**Dependency:** Lettings features B & C already built

### Feature #2: Compliance Inspection Grid + PDF Export
**Status:** 📦 FEATURE SPEC COMPLETE  
**Problem:** Fire door/smoke alarm checks have no unified display  
**Data Sources:** Admin checks + tenant self-checks + cleaner confirmations  
**Grid Format:**
```
| Date | User Type | User Name | Fire Door | Smoke Alarm | Notes | Photo |
```
**Requirements:**
- Aggregate from `compliance_logs` + `tenant_self_checks` tables
- Show in Compliance tab
- Include photo column
- Exportable to PDF (matching "C - Inspection Log" format)
- Sortable by date, user type, status
**Est. Time:** ~2-3 hours  
**Files to Create:**
- `app/admin/components/ComplianceInspectionGrid.tsx`
- `app/api/admin/compliance/export-pdf/route.ts`

### Issue #2: People Tab Schema Mismatch
**Status:** ⏳ NEEDS INVESTIGATION  
**Problem:** Error "column people_1.name does not exist"  
**Root Cause:** `people` table uses wrong field name  
**Investigation:** Check actual schema - is it `full_name`? `firstname`?  
**File:** `app/admin/properties/[id]/components/PeopleTab.tsx`  
**Fix:** Update field reference once schema confirmed  
**Est. Time:** ~15 min (once schema identified)

### Issue #3: Quick Notify AI Text Visibility
**Status:** ⏳ SIMPLE STYLING FIX  
**Problem:** AI-generated text is black on dark background (unreadable)  
**File:** `app/admin/components/QuickNotifyModal.tsx` (lines 306-311)  
**Current:**
```tsx
<textarea
  value={aiDraftMessage}
  className="w-full px-md py-sm border border-neutral-700 bg-neutral-800 text-white..."
/>
```
**Issue:** `text-white` might not be rendering or `bg-neutral-800` too dark  
**Fix:** Change to lighter background or adjust text color  
**Est. Time:** ~5 min

### Issue #4: All Units Page Mobile Layout Broken
**Status:** ⏳ NEEDS RESPONSIVE REDESIGN  
**Problem:** Table layout cramped on mobile (375px width)  
**Current:** Standard table that doesn't scroll/adapt  
**File:** `app/admin/active-rooms/page.tsx`  
**Solution:** Convert to:
- Card layout for mobile (one per line)
- Desktop: keep table
- Or: scrollable table with fixed first column
**Est. Time:** ~1-2 hours

### Issue #5: Rent Amount Shows "£-" on Mobile
**Status:** ⏳ DATA/DISPLAY INVESTIGATION  
**Problem:** Rent column shows "£-" instead of actual amounts  
**Possible Causes:**
1. Data not fetched (null rent_monthly in DB)
2. Display logic hides empty values
3. Mobile styling hides the value
**File:** `app/admin/active-rooms/page.tsx` or display component  
**Dependency:** Likely related to All Units mobile layout (Issue #4)  
**Est. Time:** ~30 min (diagnose + fix)

---

## ⚠️ MEDIUM PRIORITY (Verify & Minor Fixes)

### Issue #6: Properties View Theme Inconsistency
**Status:** ⏳ MINOR STYLING  
**Problem:** Properties page has black background; others have black bar + white content  
**Pattern:** Standard is AppBar (black) → Content area (white/light)  
**Files:**
- `app/admin/properties/page.tsx`
- `app/admin/properties/[id]/page.tsx`
**Fix:** Match standard theme pattern  
**Est. Time:** ~15 min

### Issue #7: Cleaner Notes Delivery Verification
**Status:** ⏳ TESTING ONLY  
**Problem:** Unsure if cleaner receives admin notes  
**Workflow:** Admin adds note → Cleaner should see in dashboard  
**Action:** Test by:
1. Admin adds cleaner note via property-notes page
2. Log in as cleaner
3. Check if note appears in cleaner dashboard
**Est. Time:** ~15 min (testing)

### Issue #8: API Endpoint `/api/ai/compose-notification` Verification
**Status:** ⏳ VERIFICATION ONLY  
**Problem:** Quick Notify AI feature calls this endpoint; needs to verify it exists  
**Requirement:** Needs ANTHROPIC_API_KEY env var  
**Check:** Does endpoint exist? Is API key configured?  
**Est. Time:** ~10 min

---

## ✅ COMPLETED (This Session)

### Feature B: Admin Quick Notify - Lettings Category
- ✅ 4-button category selector (General, Lettings, Maintenance, Compliance)
- ✅ 5 viewing action options (single, running late, time shift, period, batch)
- ✅ Template auto-filtering by category
- ✅ Variable substitution ({{room_name}}, {{date}}, {{time}})
- ✅ Form validation for all modes
- ✅ API: `POST /api/admin/quick-notify-lettings`

### Feature C: Time Shift All Viewings
- ✅ Time shift by 15/30/60 minutes
- ✅ Database update with time slot conversion
- ✅ Return update log (old/new times)
- ✅ API: `POST /api/viewings/time-shift`

### Lettings Templates (17 Total)
- ✅ 6 viewing-specific templates
- ✅ 11 general visit templates
- ✅ All deployed to `notification_templates` table

---

## 📋 SUGGESTED NEXT STEPS

### Option 1: Complete Lettings Workflow (High Value)
1. **Phase 2:** Lettings tab Quick Notify button (~30 min)
2. **Phase 3:** Verify B & C work in production
3. **Total:** ~1 hour → Lettings staff have complete workflow

### Option 2: Fix Critical Issues (High Impact)
1. **Verify on-notice fix** (5 min) - Already fixed, just confirm
2. **Fix people tab schema** (15 min) - Unblock PeopleTab
3. **Fix AI text color** (5 min) - Quick win
4. **Total:** ~25 min → 3 issues resolved

### Option 3: Mixed Approach (Recommended)
1. **Quick wins:** AI text color + people schema + theme inconsistency (25 min)
2. **Start mobile redesign:** All Units page responsive layout (1-2 hours)
3. **Then:** Either Phase 2 lettings OR Compliance grid

### Option 4: Big Feature
1. **Compliance Grid + PDF:** Unified inspection log (2-3 hours)
   - High value for compliance tracking
   - Aggregates data from 3 sources
   - Exportable audit trail

---

## EFFORT SUMMARY

| Task | Effort | Impact | Status |
|------|--------|--------|--------|
| Lettings Phase 2 (Notify button) | 30 min | High | Ready |
| Quick Notify AI text color | 5 min | Low | Quick fix |
| People tab schema | 15 min | Medium | Blocked UI |
| Properties theme | 15 min | Low | Polish |
| All Units mobile | 1-2 hrs | High | Major pain point |
| Rent display fix | 30 min | Medium | Data issue |
| Compliance grid | 2-3 hrs | High | Missing feature |
| Cleaner notes | 15 min | Low | Verify only |
| API verification | 10 min | Low | Check only |

---

## DEPLOYMENT STATUS

**Lettings Features (B & C):** Ready but not yet deployed  
**Previous Fixes:** 3 deployed to production (fa9b468, df43db8, 76326bd)  
**Current:** Waiting for next deployment

---

## RECOMMENDATION

**Next immediate action:** Start with **quick wins** (25 min) to unblock other work:
1. Fix AI text color (5 min)
2. Identify people schema field (15 min)  
3. Fix theme inconsistency (5 min)

**Then choose:**
- **If you want to optimize lettings:** Phase 2 (30 min) → Complete workflow
- **If you want mobile fixed:** All Units redesign (1-2 hrs) → Professional UX
- **If you want compliance:** Inspection grid (2-3 hrs) → Audit trail

Which direction interests you most?

