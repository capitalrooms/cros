# Testing Summary - 19 August 2026

**Date:** 2026-08-19  
**Tester:** Claude Code  
**Environment:** cros-sigma.vercel.app (Production)  
**User:** harry@capitalrooms.co.uk (Administrator)

---

## ✅ COMPLETED THIS SESSION

### Property Heading Color Fix
**Status:** Fixed & Deployed ✅
- Changed heading from `text-white` to `text-neutral-900`
- Verified computed color: rgb(28, 25, 23)
- Deployed to production
- Commit: 1d2403f

**Before:** White text on light background (hard to read)  
**After:** Dark text on light background (readable)

---

## ✅ TESTED & WORKING

### 1. Quick Notify Feature
- ✅ Modal opens correctly
- ✅ Property selection works
- ✅ "Send to" options display properly: All Tenants, Specific Room, Individual Tenant, Cleaners
- ✅ Tabs functional: Templates, Compose, AI Draft
- ✅ Text visibility good (white on dark background)
- ✅ Responsive on mobile

### 2. Dashboard
- ✅ All tiles render correctly
- ✅ Layout responsive on mobile
- ✅ Navigation links working

### 3. People Tab
- ✅ Data loading correctly
- ✅ No schema errors (person_id fix confirmed working)
- ✅ Shows tenants grouped by property
- ✅ Mobile responsive

### 4. Property Detail Page
- ✅ Heading now displays in dark color correctly
- ✅ All tabs accessible (Lettings, Property Info, People, Maintenance, Lettings, Communications, Compliance)
- ✅ Layout consistent with admin dashboard

---

## ⚠️ ISSUES FOUND

### CRITICAL

#### 1. Rent Amounts Displaying as "£-"
**Status:** Requires Fix  
**Severity:** High  
**Visibility:** Desktop & Mobile  
**Affected Page:** All Units  

**Issue:** All rent amounts show "£-" instead of monthly rent values
- Alice Johnson: £- (should show rent)
- Harry B: £- (should show rent)
- Bob Smith: £- (should show rent)
- Thiery Wirgo: £- (should show rent)

**Root Cause:** Unknown - needs investigation
- Possible: Field not fetching from database
- Possible: Formatting function issue
- Possible: Missing data in tenancies table

**Files to Check:**
- `/app/admin/active-rooms/page.tsx`
- Supabase query for rent_monthly field
- Data in tenancies table

---

### HIGH PRIORITY

#### 2. On-Notice Status Visibility
**Status:** Requires Investigation  
**Severity:** High  
**Affected Pages:** All Units, Lettings

**Issue:** On-notice tenancies may not be displaying or filtering correctly
- User reported: "marked harry on notice and rent disappeared"
- Current view shows all tenancies as "Active"
- Cannot verify if on-notice filtering is working

**Root Cause:** Unknown - needs testing
- Possible: Status field not updating in database
- Possible: Query filtering not including on-notice records
- Possible: Status display not showing correct values

---

### MEDIUM PRIORITY

#### 3. Quick Notify UX Redundancy
**Status:** Design Issue  
**Severity:** Medium  
**Component:** QuickNotifyModal

**Issue:** "Individual Tenant" and "Specific Room" buttons are functionally identical
- Both select a single occupancy unit
- Confusing for users which to choose
- Overlapping functionality

**Recommended Fix:**
- Consolidate into one "Specific Unit" button
- Or clarify distinction with better naming/help text
- Or restructure selector flow

---

## 📊 TESTING RESULTS BY PAGE

| Page | Desktop | Mobile | Status |
|------|---------|--------|--------|
| Admin Dashboard | ✅ | ✅ | Working |
| Quick Notify | ✅ | ✅ | Working |
| All Units | ⚠️ | ⚠️ | Rent amounts broken |
| People | ✅ | ✅ | Working |
| Property Detail | ✅ | ✅ | Working (heading fixed) |
| Communications | - | - | Not tested this session |
| Compliance | - | - | Not tested this session |
| Maintenance | - | - | Not tested this session |

---

## 🔍 THEME CONSISTENCY CHECK

**Pattern Observed:**
- Light background: `bg-neutral-100` ✅
- Dark headings: `text-neutral-900` ✅
- Content boxes: `bg-neutral-950` with `text-white` ✅
- Consistent across all admin pages ✅

---

## 🎯 RECOMMENDED NEXT STEPS

### Priority 1 (CRITICAL)
1. **Fix rent amounts display**
   - Debug why rent_monthly shows "£-"
   - Check database values
   - Verify query formatting

2. **Investigate on-notice visibility**
   - Test marking a tenancy on-notice
   - Check if it disappears from views
   - Verify RLS policies filtering correctly

### Priority 2 (HIGH)
3. **Simplify Quick Notify selector**
   - Consolidate redundant "Individual Tenant"/"Specific Room" options
   - Add help text explaining difference if keeping both

### Priority 3 (MEDIUM)
4. **Test remaining features**
   - Communications tab
   - Compliance tab
   - Maintenance tickets
   - Document upload

---

## 📝 FILES MODIFIED THIS SESSION

- ✅ `app/admin/properties/[id]/page.tsx` (heading color fix)
- Created: `property-heading-color-fixed.md` (memory)
- Updated: `MEMORY.md` (index)

---

## 🚀 DEPLOYMENT STATUS

**Latest:** Commit 1d2403f  
**Environment:** Production (cros-sigma.vercel.app)  
**Status:** Live with known issues documented above

---

## CONCLUSION

The application is mostly functional. The main issue is **rent amounts displaying as "£-"** across all entries, which is a data display or formatting bug. The **on-notice tenancy visibility** issue needs verification to confirm if it's a real problem or user misunderstanding.

Theme and heading color consistency has been fixed successfully.

---

*Report generated: 2026-08-19 by Claude Code*
