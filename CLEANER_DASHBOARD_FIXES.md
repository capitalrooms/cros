# Cleaner Dashboard Fixes - 19 Aug 2026

## Issues Fixed

### 1. ✅ Theme Inconsistency - Dark Buttons on Light Background
**Problem:** The cleaner dashboard was using dark buttons (black/neutral-950) on a light background, while the tenant dashboard uses light buttons (blue).

**Solution:** Changed all buttons and badges to use `bg-blue-500` with `hover:bg-blue-600`:
- "Book this clean" button → `bg-blue-500`
- "Open" badges in "Upcoming cleans" → `bg-blue-500`
- "+ Add Check" button in compliance section → `bg-blue-500`
- Check type buttons in modal → `bg-blue-500` (when selected)
- "Log Check" button in modal → `bg-blue-500`

**Files Modified:**
- `app/cleaner/page.tsx` - 5 button/badge color changes

### 2. ✅ Unclear Compliance Checks Property Context
**Problem:** The cleaner dashboard's compliance checks section didn't clearly show which property's logs were being displayed. Users had to infer from the property dropdown.

**Solution:** Updated the compliance checks section header to display:
- `{propertyId}` · `Last 6 months`
- Example: "071ALR · Last 6 months"

**Files Modified:**
- `app/cleaner/page.tsx` - Updated section header with property name display

### 3. 🔄 Attempted: Show On-Notice Rooms Needing Cleaning
**Status:** Deferred (database schema mismatch)

**Attempted Solution:** Created a section to show rooms marked as on-notice that need cleaning, so cleaners can see which properties require a clean to be booked.

**Issue Found:** The tenancies table doesn't have a `status` column, and `clean_frequency_weeks` is on the properties table, not rooms table. This requires schema investigation to determine the correct way to identify on-notice rooms.

**Deferred for Later:**
- Investigate tenancies schema to find on-notice tracking mechanism
- Implement section to display rooms needing cleaning once schema is clarified

## Visual Impact

### Before
- Black buttons with white text (inconsistent with tenant dashboard)
- Compliance checks section title didn't show property context
- Confusing UX when multiple properties are involved

### After
- Blue buttons matching tenant dashboard (consistent theme)
- Clear property label in compliance checks section
- Improved clarity for multi-property workflows

## Testing Completed

✅ Cleaner login works correctly  
✅ "Book a clean" button displays in blue  
✅ "Upcoming cleans" section shows blue "Open" badges  
✅ "Completed" section displays correctly with green badges  
✅ "Compliance Checks" section shows property name  
✅ "+ Add Check" button displays in blue  
✅ No console errors related to button rendering  

## Remaining Work

1. **On-Notice Rooms Feature:** Needs schema investigation to identify how on-notice status is tracked in the database
2. **Testing with Multiple Properties:** Verify the property dropdown changes compliance logs correctly

## Code Changes Summary

| File | Changes | Type |
|------|---------|------|
| `app/cleaner/page.tsx` | 5 button colors changed to blue-500, compliance header updated | Theme + UX |

**Lines Modified:** ~10 lines  
**Breaking Changes:** None  
**Backward Compatibility:** Full
