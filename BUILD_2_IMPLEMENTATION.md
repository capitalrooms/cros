# BUILD #2: Contractor Job Completion Workflow

**Date:** August 13, 2026  
**Status:** ✅ IN PROGRESS - Core components built  
**Time Budget:** 3-4 hours  
**Priority:** CRITICAL - Contractors can't finish work without this

---

## OVERVIEW

Contractors currently can mark jobs as "completed" but have no way to:
- Track costs incurred
- Document return visits needed
- Provide detailed completion notes
- Specify why a return visit is needed

**BUILD #2 solves this** by adding a comprehensive job completion modal with:
- Photo uploads (before/after already exist)
- Cost tracking with notes
- Return-visit reasoning with branching logic
- Tenant auto-notifications
- Admin audit trail

---

## FILES CREATED

### 1. Database Migration (032)
**File:** `/supabase/migrations/032-add-job-completion-fields.sql`

**New fields on `maintenance_tickets` table:**
- `completed_at` - Timestamp when job marked complete
- `completed_by` - FK to people (contractor who completed)
- `completion_notes` - Freetext field for detailed notes
- `photo_before_url` - Already exists, no change needed
- `photo_after_url` - Already exists, no change needed
- `cost` - NUMERIC(10,2) for parts/labour cost
- `cost_notes` - Description of cost (e.g., "parts")
- `return_visit_needed` - BOOLEAN flag
- `return_visit_reason` - FK key from lookup table
- `return_visit_notes` - Freetext about return visit
- `return_visit_date_estimate` - DATE for estimated return

**New tables:**
- `return_visit_reasons` - Lookup table with standardized reasons:
  - leave_to_dry (drying/curing)
  - waiting_for_parts (parts delivery)
  - specialist_needed (needs expert)
  - inspection_required (landlord/inspector)
  - tenant_not_home (couldn't access)
  - weather_dependent (external work)
  - other_return_visit (custom reason)

- `job_completion_log` - Audit trail for completions:
  - ticket_id, status_before, status_after
  - completed_at, completed_by
  - notes

**RLS Policies:**
- Contractors can update completion fields only on their own in-progress jobs
- Admin can view all completion logs
- Anyone can view return visit reasons lookup

---

### 2. JobCompletion Component  
**File:** `/app/components/JobCompletion.tsx` (330 lines)

**Props:**
- `jobId: string` - Which job to complete
- `onComplete: (result) => void` - Callback on success
- `onCancel: () => void` - Callback to close modal

**Features:**
- Modal overlay with full form
- Section 1: Completion notes (required)
  - Textarea for what was completed
  - Validation: minimum text required
- Section 2: Photo uploads (optional)
  - Before photo (optional, reuses existing if already taken)
  - After photo (optional, reuses existing if already taken)
  - Shows file names when selected
- Section 3: Cost tracking (optional)
  - Cost amount (NUMERIC field)
  - Cost notes (e.g., "parts", "labour")
- Section 4: Return visit logic (optional)
  - Checkbox: "This job needs a return visit"
  - If checked:
    - Reason dropdown (7 standard options)
    - Date field (conditionally required based on reason)
    - Notes textarea (optional)
  - Smart form state: fields hide/reset when unchecked
- Submit/Cancel buttons
- Reassuring message showing outcome
- Error handling with user-friendly messages

**Data Flow:**
1. Collect form data from user
2. Upload photos to Supabase storage (attachments bucket)
3. Get current user's person_id
4. Update `maintenance_tickets` row with all completion fields
5. Insert row in `job_completion_log` for audit trail
6. Call `/api/notify-job-complete` (non-blocking)
7. Show success callback to parent component
8. Parent component refreshes job detail

---

### 3. Integration into Job Detail Page
**File:** `/app/contractor/job/[jobId]/page.tsx` (modifications)

**Changes needed:**
1. Import JobCompletion component at top
2. Add state: `const [showCompletion, setShowCompletion] = useState(false)`
3. Replace the simple "Mark job complete" button with:
   ```tsx
   <button onClick={() => setShowCompletion(true)} 
     disabled={!job.after_photo}
     className="...">
     ✅ Mark job complete
   </button>
   ```
4. Add modal at bottom of return:
   ```tsx
   {showCompletion && (
     <JobCompletion 
       jobId={jobId}
       onComplete={() => {
         alert('✅ Job completed!');
         router.push('/contractor');
       }}
       onCancel={() => setShowCompletion(false)}
     />
   )}
   ```
5. Update notification endpoint to call `/api/notify-job-complete` with context

**What stays the same:**
- Photo taking flow (before/after photos)
- Booking flow (date/time selection)
- Arrival check (location verification)
- Simple notes field (for quick notes during work)

**New flow:**
- When contractor clicks "Mark complete" → Opens modal
- Fills in completion details (notes, cost, return visit)
- Uploads photos (or reuses existing ones)
- Submits → Updates database + sends notifications → Redirects to jobs list

---

## NOTIFICATION UPDATES

### New Endpoint: `/api/notify-job-complete`

**Receives:**
- `ticketId: string`
- `hasReturnVisit: boolean`
- `returnVisitDate: string | null`

**Actions:**
- Get job details (title, property, room)
- Get tenant for property
- If `hasReturnVisit === false`:
  - Send: "✅ [Work Type] at [Property] is now complete. Thank you!"
  - Include link to job detail (read-only)
- If `hasReturnVisit === true`:
  - Send: "✅ [Work Type] is complete, but we need a follow-up visit on [Date]. We'll be in touch to book it."
  - Include return visit reason
- Log notification to audit trail

---

## VALIDATION RULES

**On submit, enforce:**
1. Completion notes: required, minimum 10 characters
2. Return visit reason: required if return_visit_needed = true
3. Return visit date: required if reason.requires_date_estimate = true
4. Date: must be in future (estimated return date)

**Optional fields:**
- Photos (already captured, optional to add new ones)
- Cost amount (can be £0.00 or null)
- Cost notes (only used if cost > 0)
- Return visit notes (freetext, no validation)

---

## TESTING SCENARIOS

### SCENARIO 1: Job Complete, No Return
**Setup:** Contractor with booked job that has after_photo  
**Steps:**
1. Job shows "✅ Mark job complete" button
2. Click button → Modal opens
3. Enter notes: "Door handle replaced and tested"
4. Leave "Return visit" unchecked
5. Click "Mark Job Complete"

**Expected:**
- Job status changes to "completed"
- Tenant notified: "Door handle replacement is now complete. Thank you!"
- Admin sees completion in job detail (read-only view)
- No follow-up visits created

---

### SCENARIO 2: Job Complete With Return Visit
**Setup:** Contractor with paint job that needs drying time  
**Steps:**
1. Click "Mark complete" button
2. Enter notes: "Painted walls with 2 coats, now drying"
3. Add cost: £45.50 for paint supplies
4. Check "This job needs a return visit"
5. Select reason: "Needs to dry/cure"
6. Enter date: Aug 20, 2026 (3 days away)
7. Enter notes: "Will check finish and touch up any drips"
8. Click "Mark Job Complete"

**Expected:**
- Job marked complete with all metadata saved
- Cost logged: £45.50
- Return visit created with type "leave_to_dry"
- Tenant notified: "Paint work is complete but we need a follow-up on Aug 20. We'll be in touch to book it."
- Admin can see return visit pending on calendar

---

### SCENARIO 3: Cost Without Return Visit
**Setup:** Quick fix job  
**Steps:**
1. Upload before photo → marks as "in progress"
2. Upload after photo
3. Click "Mark complete"
4. Notes: "Tightened loose hinges"
5. Add cost: £0.00 (no parts used)
6. No return visit needed
7. Submit

**Expected:**
- Job completed
- Cost recorded as £0.00
- No return visit
- Tenant notification sent

---

### SCENARIO 4: Issue Reported By Admin
**Setup:** Admin added note: "Check under sink for water damage"  
**Steps:**
1. Contractor arrives, checks under sink
2. Finds damage requiring specialist
3. Uploads photos
4. Clicks complete
5. Notes: "Water damage found, needs specialist plumber"
6. Check "Return visit"
7. Select: "Specialist needed for follow-up"
8. Date: Aug 18
9. Submit

**Expected:**
- Job marked complete
- Admin note acknowledged in completion_notes
- Return visit logged for specialist assessment
- Tenant notified of finding + specialist visit needed

---

## ERROR HANDLING

**User-friendly errors:**
- "Please enter completion notes" (required field)
- "Please select a reason for return visit" (return_visit_needed = true)
- "Please enter estimated return visit date" (reason.requires_date_estimate = true)
- "Date must be in the future" (validation)
- "Failed to complete job: [error message]" (API failures)

**Non-blocking failures:**
- Notification failures don't block job completion
- Photo upload failures show error but allow submit anyway
- Audit log failures don't block (non-critical)

---

## ADMIN VISIBILITY

**In job detail page (admin view):**
- See all completion fields (read-only)
- See photos taken
- See cost logged
- See return visit details
- See completion timestamp + who completed

**In property maintenance summary:**
- See completion rate (jobs completed vs assigned)
- See average completion time
- See cost trends (total cost by month)
- See return visit patterns

---

## DEPLOYMENT CHECKLIST

- [ ] Deploy migration 032 to Supabase
- [ ] Verify tables created with correct schema
- [ ] Verify RLS policies enforced
- [ ] Create JobCompletion component
- [ ] Import into job detail page
- [ ] Update job detail page to show modal
- [ ] Create `/api/notify-job-complete` endpoint
- [ ] Test all 4 scenarios above
- [ ] Verify notifications sent correctly
- [ ] Verify audit logs created

---

## PRODUCTION READINESS

**When BUILD #2 is complete:**
- ✅ Contractors can finish work with detailed completion data
- ✅ Admin has visibility into what was done and what's pending
- ✅ Tenants know when follow-up visits are needed
- ✅ Cost tracking enabled for job profitability
- ✅ Audit trail for compliance

**System will be 60% production-ready** (3/5 critical components)
- ✅ Tenants complete safety checks (BUILD #1)
- ✅ Contractors finish work (BUILD #2)
- ⏳ Admins organize cleaner notes (BUILD #3)
- ⏳ Landlords see property compliance (Phase 2)
- ⏳ All hubs fully functional (Phase 3)

---

## NEXT AFTER BUILD #2

Once BUILD #2 is tested and verified:

**Phase 2a (Same sprint):**
- Build #3: Cleaner notes + Internal admin notes (2-3 hrs)

**Phase 2b (Next sprint):**
- Property compliance dashboard (property-level photo logs, bulk requests, PDF export)
- Landlord hub completion
- Tenant feedback option

---

## FILE SUMMARY

| File | Lines | Status |
|------|-------|--------|
| 032-add-job-completion-fields.sql | 85 | ✅ Created |
| JobCompletion.tsx | 330 | ✅ Created |
| job/[jobId]/page.tsx (updated) | 454 | 🔨 To integrate |
| notify-job-complete/route.ts (new) | ~50 | 🔨 To create |

**Total new code:** 515+ lines
**Effort:** 3-4 hours including testing

---

**BUILD #2 Status: COMPONENTS READY, PENDING INTEGRATION & TESTING**
