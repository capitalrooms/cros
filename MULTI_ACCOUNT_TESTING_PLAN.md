# Multi-Account Testing Plan - CROS v1

## Test Users to Create

```sql
-- Admin
admin@example.com / password123
Role: administrator
Can: View all properties, create jobs, manage staff

-- Lettings Agent (Jacob)
jacob@example.com / password123
Role: lettings
Can: Book viewings, manage applications

-- Tenant 1 (Room 5)
tenant1@example.com / password123
Role: tenant
Assigned: 12 Saltwell Street, Room 5

-- Tenant 2 (Room 6)
tenant2@example.com / password123
Role: tenant
Assigned: 12 Saltwell Street, Room 6

-- Cleaner
cleaner@example.com / password123
Role: cleaner
Can: View assigned properties, log cleans

-- Landlord
landlord@example.com / password123
Role: landlord
Can: View own properties only
```

---

## Test Scenario 1: Data Isolation (CRITICAL)

### Setup
- Book a viewing for **Room 6 only** (Tenant2's room)
- Tenant1 is in Room 5, Tenant2 is in Room 6

### Test Steps

#### Step 1a: Admin Books Viewing
```
1. Log in as admin@example.com
2. Navigate to /lettings
3. Book viewing for "Room 6" (Tenant2's room)
4. Set date: Tomorrow, 2pm
5. Add visitor: "Jane Doe"
6. Expected: Viewing created successfully
```

#### Step 1b: Tenant1 Dashboard (Should NOT see Room 6 viewing)
```
1. Log in as tenant1@example.com
2. Navigate to /tenant
3. Check "What's coming up" → "At your property" section
4. CRITICAL CHECK: Should show generic "Viewing · 2:00pm"
   NOT "Room 6 viewing" or "Tenant2's room"
5. Click viewing card
6. CRITICAL: Should NOT show which room (privacy leak test)
```

**Expected Result:** ✅ Tenant1 sees time but NOT room 6 name

**Fail Scenario (Security Breach):** ❌
- Tenant1 sees "Room 6 viewing"
- Tenant1 can click and see Tenant2's room details
- Data isolation failure → FIX REQUIRED

---

#### Step 1c: Tenant2 Dashboard (Should see Room 6 viewing)
```
1. Log in as tenant2@example.com
2. Navigate to /tenant
3. Check "What's coming up" → "At your property" section
4. Should show: "Viewing · 2:00pm" clearly visible
5. Click to see full details
6. Expected: Can see "Room 6" name (it's their room)
```

**Expected Result:** ✅ Tenant2 sees full viewing details

---

#### Step 1d: Check Notifications
```
1. Check browser console / notification logs
2. Admin sent notifications to: [Tenant2 ID only]
   NOT to Tenant1
3. Notification message: "A prospective tenant viewing is scheduled..."
   NOT "Room 6 viewing"
```

**Expected Result:** ✅ Only Tenant2 gets notification, message is generic

---

### Audit: Database Level
```sql
-- As Supabase admin, check viewings table:
SELECT id, room_id, visitor_name, viewing_date FROM viewings 
WHERE viewing_date = tomorrow AND room_id = 'room-6-id';

-- Check notifications sent:
SELECT user_id, type, message FROM notifications 
WHERE related_table = 'viewings' 
ORDER BY created_at DESC LIMIT 5;

-- Expected: notification.user_id = tenant2_id ONLY
-- Expected: message does NOT contain "room" or "6"
```

---

## Test Scenario 2: Tenant Cannot Access Admin Data

### Step 2a: Try Admin URL
```
1. Log in as tenant1@example.com
2. Manually type: /admin
3. Expected: Redirected to /tenant (no access)
4. Check console: No API errors, clean redirect
```

**Pass:** ✅ Redirected cleanly  
**Fail:** ❌ 500 error, can see admin data, blank page

---

### Step 2b: Try Admin API
```
1. Open browser DevTools → Network tab
2. Log in as tenant1@example.com
3. Manually fetch: /api/admin/whatever (any fake endpoint)
4. Expected: 401 Unauthorized or 403 Forbidden
5. Response should NOT include admin data
```

**Pass:** ✅ 401/403 with error message  
**Fail:** ❌ 200 OK with data, blank response

---

## Test Scenario 3: Cleaner Isolation

### Setup
- Assign cleaner to: 12 Saltwell Street ONLY
- Do NOT assign to: 123 East Street

### Step 3a: Cleaner Sees Assigned Property
```
1. Log in as cleaner@example.com
2. Navigate to /cleaner dashboard
3. Expected: Shows "12 Saltwell Street" in property list
4. Can view cleaning jobs for this property
```

**Pass:** ✅ Can see assigned property  
**Fail:** ❌ Cannot see dashboard, error, redirects

---

### Step 3b: Cleaner Cannot See Other Properties
```
1. Still logged in as cleaner@example.com
2. Try manually accessing: /cleaner/property/123-east-street-id
3. Expected: 403 Forbidden or redirect with error
4. Should NOT see other property's cleaning jobs
```

**Pass:** ✅ Access denied cleanly  
**Fail:** ❌ Can see other property data, 500 error

---

### Step 3c: Cleaner Cannot Access Admin Routes
```
1. Still logged in as cleaner@example.com
2. Try: /admin/compliance-logs
3. Expected: Redirected to /cleaner or 403 Forbidden
4. Should NOT see compliance data
```

**Pass:** ✅ Redirected  
**Fail:** ❌ Can access admin page, sees data

---

## Test Scenario 4: Landlord Isolation

### Setup
- Landlord owns: 12 Saltwell Street ONLY
- Does NOT own: 123 East Street

### Step 4a: Landlord Sees Own Properties
```
1. Log in as landlord@example.com
2. Expected: Dashboard shows "12 Saltwell Street"
3. Can view tenants in this property
4. Can view compliance logs for this property
```

**Pass:** ✅ See own property data  
**Fail:** ❌ Cannot see dashboard

---

### Step 4b: Landlord Cannot See Other Properties
```
1. Still logged in as landlord@example.com
2. Try accessing: /landlord/properties/123-east-street-id
3. Expected: 403 Forbidden or redirect
4. Cannot see tenants, compliance, or notes
```

**Pass:** ✅ Access denied  
**Fail:** ❌ Can see other property

---

## Test Scenario 5: Admin Notes Internal Field

### Setup
- Admin creates acknowledgment note with both public & internal message

### Step 5a: Admin Creates Note
```
1. Log in as admin@example.com
2. Navigate to /admin/acknowledgment-notes
3. Create Note:
   - Tenant: Tenant1
   - Title: "Appliance Safety Reminder"
   - Message: "Please ensure microwave is turned off after use"
   - Internal note: "Tenant left stove on, third time this month"
4. Click "Create Note"
5. Expected: Note appears in Active list
```

**Pass:** ✅ Note created  
**Fail:** ❌ Cannot create, error

---

### Step 5b: Tenant Sees Public Message ONLY
```
1. Log in as tenant1@example.com
2. Navigate to /tenant/acknowledgment-notes
3. Expected: See "Appliance Safety Reminder" message
4. CRITICAL: Do NOT see "Tenant left stove on..." internal note
5. Can click "I Acknowledge" button
6. Expected: Note moves to "Acknowledged" section
```

**Pass:** ✅ Tenant sees public, not internal  
**Fail:** ❌ Tenant sees internal note (DATA BREACH)

---

### Step 5c: Verify Internal Note Not in Response
```
1. As tenant1@example.com, open DevTools → Network
2. Navigate to /tenant/acknowledgment-notes
3. Check API response: /api/tenant/acknowledgment-notes
4. Expected: Response JSON DOES NOT include "internal_note" field
5. Example:
   {
     "id": "...",
     "title": "Appliance Safety Reminder",
     "message": "Please ensure...",
     // ❌ MISSING: "internal_note": "Tenant left stove..."
   }
```

**Pass:** ✅ Internal field absent in API response (RLS working)  
**Fail:** ❌ Response includes internal_note (RLS BROKEN)

---

## Test Scenario 6: Compliance Logs Access

### Setup
- Admin has created 2 fire door checks at 12 Saltwell Street
- Cleaner can view but not create (read-only access)

### Step 6a: Admin Views Compliance Logs
```
1. Log in as admin@example.com
2. Navigate to /admin/compliance-logs
3. Expected: See "12 Saltwell Street" property selector
4. Expected: See "🚪 Fire Door Checks" with 2 entries
5. Can click "Add Check" button
```

**Pass:** ✅ Can view and create  
**Fail:** ❌ Cannot access page, no create button

---

### Step 6b: Cleaner Views Compliance Logs (Read-Only)
```
1. Log in as cleaner@example.com
2. Navigate to /cleaner/compliance-logs (or similar)
3. Expected: Can see fire door checks
4. Expected: NO "Add Check" button (read-only)
5. If try to create via API: 403 Forbidden
```

**Pass:** ✅ Read-only access  
**Fail:** ❌ Cannot see, or can create (wrong permissions)

---

### Step 6c: Cleaner Cannot See Other Properties
```
1. Still logged in as cleaner@example.com
2. Try accessing: /cleaner/compliance-logs?property=123-east-st-id
3. Expected: 403 Forbidden or only shows assigned properties
4. Cannot see 123 East Street compliance data
```

**Pass:** ✅ Filtered to assigned properties  
**Fail:** ❌ Can see all properties

---

## Test Scenario 7: Viewing Edit Feature

### Setup
- Admin booked viewing for Tenant1, Room 5 at tomorrow 2pm
- Needs to change to 3pm (test edit functionality)

### Step 7a: Admin Edits Viewing
```
1. Log in as admin@example.com
2. Navigate to /lettings
3. Find the viewing card for Room 5
4. Click on viewing card
5. Expected: Edit modal opens with fields:
   - Date: [Tomorrow]
   - Time: [2:00pm]
   - Visitor Name: [Jane Doe]
6. Change time to 3:00pm
7. Click "Save"
8. Expected: View closes, viewing updated
```

**Pass:** ✅ Can edit and save  
**Fail:** ❌ No edit button, cannot save, 500 error

---

### Step 7b: Tenant Sees Updated Time
```
1. Log in as tenant1@example.com
2. Refresh dashboard
3. Expected: "Viewing" now shows "3:00pm" (not 2:00pm)
4. Old notification should be replaced or updated
```

**Pass:** ✅ Sees updated time  
**Fail:** ❌ Still shows old time (cache issue or DB not updated)

---

### Step 7c: Check Notification Re-Sent
```
1. Admin opened DevTools Network tab before edit
2. After clicking Save, check API call made
3. Expected: POST to /api/notify-viewing-rescheduled or similar
4. Expected: New notification sent to Tenant1 with updated time
5. Old notification marked as "superseded" (if logged)
```

**Pass:** ✅ Re-notification sent  
**Fail:** ❌ No new notification (tenant thinks still 2pm)

---

## Test Scenario 8: SMS Confirmation

### Setup
- Admin books viewing
- System prompts for SMS confirmation

### Step 8a: Admin Sees SMS Prompt
```
1. Log in as admin@example.com
2. Navigate to /lettings
3. Book new viewing
4. Expected: After booking, SMS confirmation modal appears
5. Modal shows: "Send SMS confirmation to visitor?"
6. Phone input field
7. "Send SMS" and "Skip" buttons
```

**Pass:** ✅ Modal appears with fields  
**Fail:** ❌ No modal, no phone field

---

### Step 8b: Admin Sends SMS
```
1. In modal, enter phone: +441234567890
2. Click "Send SMS"
3. Expected: Modal closes
4. Expected: Success message: "✅ SMS sent"
5. Check network tab:
   - POST to /api/sms/send-viewing-confirmation
   - Body includes: {phone, visitorName, viewingDate, viewingTime}
6. Expected: Response: {success: true}
```

**Pass:** ✅ SMS sent successfully  
**Fail:** ❌ 400 error, no success message

---

### Step 8c: Rate Limiting
```
1. Admin sends SMS 10 times rapidly
2. Expected: 10th request fails with 429 Too Many Requests
3. Expected: Error message: "Rate limit exceeded. Try again in 1 hour"
```

**Pass:** ✅ Rate limited after threshold  
**Fail:** ❌ All 10 go through (spam vulnerability)

---

## Test Scenario 9: Safety Checks Flow

### Setup
- Generate monthly safety check for Tenant1 (fire door)
- Tenant responds
- Admin views response

### Step 9a: Generate Checks
```
1. Log in as admin@example.com
2. Navigate to /admin (or API endpoint)
3. Call: POST /api/tenant-safety-checks/generate
4. Expected: Creates fire door check for all active tenants
```

**Pass:** ✅ Checks created  
**Fail:** ❌ 500 error, no checks created

---

### Step 9b: Tenant Sees Check Prompt
```
1. Log in as tenant1@example.com
2. Navigate to /tenant/safety-checks
3. Expected: "Action Needed" section shows:
   - "🚪 Fire Door Check" card
   - Instructions: "Please check that your room's fire door closes..."
   - "✓ All Good" button
   - "⚠️ There's an Issue" button
4. Click "✓ All Good"
5. Expected: Button changes to "Confirming..."
6. Expected: Card moves to "Check History" section
```

**Pass:** ✅ Can respond to check  
**Fail:** ❌ No prompt visible, buttons don't work

---

### Step 9c: Admin Views Response
```
1. Log in as admin@example.com
2. Navigate to /admin/tenant-safety-checks
3. Expected: See table:
   | Tenant | Room | Request Date | Response | Details |
   | Tenant1 | Room 5 | Aug 13 | ✓ OK | (empty) |
4. Filter: "Confirmed OK" button
5. Expected: Shows only confirmed checks (Tenant1 visible)
6. Filter: "Pending" button
7. Expected: Shows no pending checks for this property
```

**Pass:** ✅ Admin sees responses  
**Fail:** ❌ No data shown, cannot filter

---

### Step 9d: Tenant Reports Issue
```
1. Log in as tenant1@example.com
2. Navigate to /tenant/safety-checks
3. Generate a new check (admin re-runs)
4. Click "⚠️ There's an Issue"
5. Expected: Form appears:
   - Issue Type dropdown: "Door doesn't close properly"
   - Describe Issue textarea
6. Select issue type, enter description: "Door latch is broken"
7. Click "Submit Issue"
8. Expected: Success message, card moves to history
```

**Pass:** ✅ Issue reported  
**Fail:** ❌ Cannot submit, form doesn't appear

---

### Step 9e: Admin Sees Issue
```
1. Log in as admin@example.com
2. Navigate to /admin/tenant-safety-checks
3. Filter: "Issues Reported"
4. Expected: Shows Tenant1's issue
5. Table columns:
   - Tenant: "Tenant1"
   - Room: "Room 5"
   - Response: "⚠️ Issue"
   - Details: "Door doesn't close properly"
```

**Pass:** ✅ Issue visible to admin  
**Fail:** ❌ Not shown, or description empty

---

## Test Results Template

Create spreadsheet with columns:

| Test # | Scenario | Step | Expected | Actual | Pass/Fail | Fix Required |
|--------|----------|------|----------|--------|-----------|--------------|
| 1a | Data Isolation | Admin books viewing | Viewing created | ??? | ??? | ??? |
| 1b | Data Isolation | Tenant1 dashboard | Generic viewing visible | ??? | ??? | ??? |
| 1c | Data Isolation | Tenant2 dashboard | Full details visible | ??? | ??? | ??? |
| ... | ... | ... | ... | ... | ... | ... |

---

## Critical Failure Scenarios (Stop Deployment If Found)

❌ **STOP** if:
1. Tenant1 can see Tenant2's room name
2. Tenant can access /admin pages
3. Cleaner can see other properties
4. Admin internal notes visible to tenant
5. Rate limiting not working on SMS
6. RLS error messages visible (info leak)
7. Any 500 error on permission check (should be 403)

---

## Sign-Off

- [ ] All 9 scenarios completed
- [ ] All "Critical Failure" checks passed
- [ ] Security audit fixes applied
- [ ] Database indexes verified
- [ ] Load testing done (50 concurrent users)
- [ ] Ready for 70+ user deployment

