# Session Verification Checklist - 19 Aug 2026

## ✅ COMPLETED IN THIS SESSION

### 1. Cleaner Dashboard Theme
- ✅ Changed "Book a clean" section from white to BLACK background
- ✅ Changed all form labels to light text (neutral-200)
- ✅ Changed form inputs to dark backgrounds with white text
- ✅ Changed "Book this clean" button from black to BLUE
- ✅ Changed "Open" badges from black to BLUE
- ✅ Changed "+ Add Check" button to BLUE
- ✅ Changed "Completed" cleans cards to BLACK with white text
- ✅ Changed "Compliance Checks" cards to BLACK with white text

### 2. Compliance Checks
- ✅ Added fire door check for 12 Saltwell Street (verified shows in list)
- ✅ Section header now shows property name: "12 Saltwell Street · Last 6 months"
- ✅ Check displays: Date, Cleaner name, Check type, Notes

### 3. Pagination
- ✅ Added state for cleansDisplayLimit (starts at 20)
- ✅ Added totalCleansCount tracking
- ✅ Added "Load More Cleans (X of Y)" button (appears when more than 20 cleans)
- ✅ Increments by 20 each time

### 4. Log Past Clean Feature
- ✅ Added "📝 Log Past Clean" button in Book a clean section
- ✅ Modal opens with Property, Date, Notes fields
- ✅ Date can be set to past dates
- ✅ Successfully logged emergency clean from 18 Aug
- ✅ Appears immediately in "Completed" section

---

## ⚠️ PENDING INVESTIGATION

### Issue 1: On-Notice Room Notes Not Visible to Cleaner
**Original Problem:** "Why did she not get that note about harry b room on notice that needs a clean"

**Attempted Fix:** Added "Rooms Needing Cleaning" section but failed because:
- tenancies table doesn't have a `status` column
- Database schema unclear on how on-notice is tracked

**Current Status:** NOT YET RESOLVED

### Issue 2: How Should Admins Communicate Extra/Unscheduled Cleaning?
**Problem:** No mechanism for admins to send urgent cleaning requests to cleaners

**Needs Design:** 
- Should there be a red alert/badge?
- Should admins be able to send push notifications?
- Should there be a "Urgent Jobs" section for cleaners?
- How does this differ from "Log Past Clean"?

---

## 👥 USER TESTING STATUS

| User | Email | Password | Status | Notes |
|------|-------|----------|--------|-------|
| Admin | harry@capitalrooms.co.uk | TestPassword123! | ⚠️ UNTESTED | Need to verify admin can see cleaner notes, compliance logs, schedule cleans |
| Lettings | lettings@example.com | password123 | ⚠️ UNTESTED | Need to verify lettings dashboard, viewing system |
| Tenant | tenant1@example.com | password123 | ⚠️ UNTESTED | Need to verify tenant sees property info, safety checks |
| Cleaner | cleaner@example.com | password123 | ✅ TESTED | Theme fixed, pagination working, can log past cleans |
| Contractor | contractor@example.com | password 123 | ❌ NOT TESTED | Never logged in |

---

## 🔴 CRITICAL FINDINGS - ON-NOTICE ISSUE

### Root Cause Analysis
**Issue:** Cleaner Carol did NOT see notes about "Harry B Room (Room 2 at 12 Saltwell) on notice needing a clean"

**Diagnosis:**
1. ❌ All Units table shows Room 2 as "Active" - NO on-notice status visible to admin
2. ❌ No mechanism for admin to flag a room as "needs cleaning"
3. ❌ No way for admin to send urgent/unscheduled cleaning requests to cleaners
4. ❌ Cleaner dashboard has NO section for "Urgent Jobs" or "Admin Requests"
5. ❌ Cleaner only sees "scheduled" cleans (booked in advance) - nothing else

### Data Structure Problem
- `tenancies` table likely has `end_date` field
- No explicit "on_notice" or "needs_cleaning" status field visible
- Needs clarification: How is on-notice tracked? Via end_date? Via separate status column?

### Missing Feature: Admin → Cleaner Communication
**Current Flow (Broken):**
```
Room needs cleaning → Admin has no way to notify → Cleaner doesn't know → Room doesn't get cleaned
```

**Needed Flow:**
```
Admin flags room for cleaning → Cleaner sees urgent alert → Cleaner acts immediately
```

---

---

## 💡 PROPOSED SOLUTION: Admin-to-Cleaner Job Assignment

### Most Sensible UX Design

**In Admin Dashboard:**
```
Properties → Select Property → Choose Room → "Add Cleaning Task"
Modal opens:
  - Task Type: Normal / Urgent / ASAP
  - Notes: Why it needs cleaning (e.g., "Tenant moving out", "Emergency spill")
  - Cleaner: Auto-assign to usual cleaner OR select manually
  - Priority indicator: 
    * Normal = Blue
    * Urgent = Orange  
    * ASAP = Red
  - Send Notification: ☐ Yes (default)
  
Click "Assign Task" → Cleaner gets push notification
```

**In Cleaner Dashboard:**
```
New Section: "📌 Assigned Jobs" (above Upcoming cleans)
Shows:
  - Room address
  - Task priority (color-coded: Blue/Orange/Red)
  - Task description/notes
  - Admin who assigned it
  - Time created
  
With Actions:
  - "Accept & Book" → Creates a clean entry with status "assigned"
  - "View Details" → Shows full task info
  - (Option) "Can't do this" → Reassign to another cleaner
```

**Visual Design for Cleaner Dashboard:**
```
URGENT (Red):
┌─────────────────────────────────────────┐
│ 🚨 ASAP: 12 Saltwell Street - Room 2   │
│ Harry B room - Tenant moving out today  │
│ Assigned by: Admin Harry (2 min ago)    │
│ [Accept & Book] [View Details]          │
└─────────────────────────────────────────┘

NORMAL (Blue):
┌─────────────────────────────────────────┐
│ 📌 4 Willis Road - Room 2                │
│ Post-viewing clean needed                │
│ Assigned by: Admin Harry (30 min ago)   │
│ [Accept & Book] [View Details]          │
└─────────────────────────────────────────┘
```

**Key Benefits:**
1. ✅ Admin can immediately request cleaning without pre-booking
2. ✅ Cleaner sees WHAT and WHY (context)
3. ✅ Color-coded urgency (red = drop everything)
4. ✅ No "forgotten" cleaning jobs
5. ✅ Maintains distinction between scheduled vs. requested work
6. ✅ Works with "Log Past Clean" feature (can log after completing)

---

## NEXT STEPS

### Priority 1: Test All User Roles
- Log in as Admin (harry@capitalrooms.co.uk)
- Log in as Lettings (lettings@example.com) 
- Log in as Tenant (tenant1@example.com)
- Log in as Contractor (contractor@example.com)
- Verify each sees correct data and features

### Priority 2: Resolve On-Notice Issue
- Query database schema to understand tenancy status tracking
- Implement proper visibility of on-notice rooms to cleaner
- Add visual indicator (red text/badge) for rooms needing cleaning

### Priority 3: Design Admin-to-Cleaner Communication
- Define workflow for requesting extra cleaning
- Decide on visual design (red alert? notification? separate section?)
- Implement notification system
- Test end-to-end flow

### Priority 4: Integration Testing
- Verify all features work across all user roles
- Check data isolation (users only see their own data)
- Test edge cases (100+ cleans, many past cleans, etc.)
