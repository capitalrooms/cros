# Systematic Testing & Build Plan

**Purpose:** Execute Step 1 (test NEEDS_CHECKING) then Step 2 (build MISSING)  
**Date:** August 13, 2026

---

## STEP 1: TESTING "NEEDS CHECKING" ITEMS (20 items)

### TEST SEQUENCE (In order of impact)

#### TEST 1: Admin Notes to Cleaner
**Requirement:** Admin's notes to cleaner appear on clean detail screen  
**How to test:**
1. Log in as ADMIN
2. Navigate to Property Notes or find a way to add note to 12 Saltwell Street with tag "for cleaner" or "admin note"
3. Log in as CLEANER
4. Open the most recent clean booking for 12 Saltwell Street
5. Verify admin note appears on the clean detail page
6. **Status if appears:** ✅ VERIFIED  
**Status if missing:** ❌ BUILD THIS

---

#### TEST 2: Cleaner Can Edit Additional Charges
**Requirement:** Additional task charge is editable after logging  
**How to test:**
1. Log in as CLEANER
2. Open an existing/past cleaning job
3. Look for "edit" button on the £15 charge we logged earlier
4. Try to edit the amount or description
5. **Status if works:** ✅ VERIFIED  
**Status if no edit:** ⚠️ LIMITATION - Document as read-only

---

#### TEST 3: Cleaner Can Log Product Costs
**Requirement:** Cleaning product cost can be logged by cleaner, editable afterwards  
**How to test:**
1. Log in as CLEANER
2. Open a clean job detail page
3. Look for a "Product cost" or "Supplies" input field
4. If found, add a cost (e.g., £5.00)
5. Try to edit it
6. **Status if field exists:** ✅ VERIFIED  
**Status if missing:** ❌ BUILD THIS

---

#### TEST 4: Admin Can Assign Task List to Cleaner
**Requirement:** Admin can pick from short task list ("do the oven") to attach to next clean  
**How to test:**
1. Log in as ADMIN
2. Navigate to property notes or find admin-to-cleaner note feature
3. Look for a dropdown of preset tasks (oven, windows, carpet, etc.)
4. Try to assign one to a property/cleaner
5. Log in as CLEANER
6. Verify task appears on their dashboard
7. **Status if works:** ✅ VERIFIED  
**Status if missing:** ❌ BUILD THIS

---

#### TEST 5: Contractor Status Screens Consolidated
**Requirement:** Job status screens consolidated (not two separate screens)  
**How to test:**
1. Log in as ADMIN
2. Create/assign a test job to a contractor
3. Log in as CONTRACTOR
4. Check if there's one unified job screen vs. two separate screens
5. **Status if unified:** ✅ VERIFIED  
**Status if separate:** ⚠️ NEEDS CONSOLIDATION

---

#### TEST 6: Contractor "In Progress" States
**Requirement:** "In progress" vs "awaiting return" distinguished properly  
**How to test:**
1. Assign a contractor job that needs a return visit
2. Log in as CONTRACTOR
3. Mark it "in progress"
4. Look for option to distinguish "waiting for drying/part/inspection"
5. **Status if works:** ✅ VERIFIED  
**Status if missing:** ❌ BUILD THIS

---

#### TEST 7: Property Notes Accessible Separately
**Requirement:** Property dashboard separate from Edit flow  
**How to test:**
1. Log in as ADMIN
2. Go to /admin/property-notes
3. Verify you can add notes without entering a property "edit" mode
4. **Status if works:** ✅ VERIFIED  
**Status if integrated:** ⚠️ NEEDS SEPARATION

---

#### TEST 8: History of Previous Notes
**Requirement:** History of previous notes viewable per property  
**How to test:**
1. Log in as ADMIN
2. Go to Property Notes for 12 Saltwell Street
3. Look for a "history" or "previous notes" section
4. **Status if visible:** ✅ VERIFIED  
**Status if missing:** ❌ BUILD THIS

---

#### TEST 9: Notification Prompt Persistence
**Requirement:** Notifications prompt appears once then remembers choice  
**How to test:**
1. Log out completely
2. Log back in as any user
3. See if "Notifications blocked" prompt appears again
4. **Status if persists choice:** ✅ VERIFIED  
**Status if reappears:** ⚠️ FIX PERSISTENCE

---

#### TEST 10: Photo Attachment When Raising Job
**Requirement:** Photo attachment available when raising maintenance job  
**How to test:**
1. Log in as ADMIN
2. Go to /admin/maintenance and "Create job"
3. Look for file/photo upload field
4. **Status if present:** ✅ VERIFIED  
**Status if missing:** ❌ BUILD THIS

---

### Other NEEDS_CHECKING items (require contractors to have jobs)
These can only be tested once contractors have assigned jobs:
- Contractor status buttons responsive on mobile
- Return-visit reason from dropdown
- Return-visit branching questions
- Tenant-facing notes on in-progress status
- Booking flow streamlined
- Job "1 to schedule" bar clickable
- "Booked in" status contradiction
- Status header visually contains section
- Contractor selection when raising job
- Quote-request option
- Batching tenant confirmations
- Per-job notification in batch
- Lead-logging in lettings
- Old certificate visibility
- Available rooms status change

**→ Action:** Create 2-3 test contractor jobs to enable this testing

---

## STEP 2: BUILD MISSING ITEMS (16 items)

### PRIORITY 1: CRITICAL FUNCTIONALITY (Build first - users need these)

#### BUILD 1: Tenant Self-Check Prompts (Fire Door / Smoke Alarm)
**Files needed:**
- `/app/tenant/safety-checks/page.tsx` (NEW)
- `/app/api/cron/send-safety-check-prompts/route.ts` (NEW)
- Database tables: `tenant_self_checks`, `tenant_self_check_issues`
- Migrations: Add compliance checking tables

**Scope:**
- Monthly tenant prompt for fire door check
- Monthly tenant prompt for smoke alarm check
- Quarterly versions require photo
- Issue type picklist when problem reported
- Admin dashboard showing all responses
- Ability to create maintenance job from issue

**Estimated time:** 3-4 hours
**Impact:** CRITICAL - Compliance requirement

---

#### BUILD 2: Tenant Acknowledgment Notes (New Note Type)
**Files needed:**
- Database table: `tenant_acknowledgment_notes` (NEW)
- Update: `/app/admin/property-notes/page.tsx` - add "acknowledgment" note type
- Update: `/app/tenant/page.tsx` - show acknowledgment cards

**Scope:**
- Admin can create acknowledgment-required notes
- Notes show prominently on tenant dashboard
- Tenant must click "I acknowledge" or upload photo
- Auto-files after 7 days if not acknowledged
- Internal admin "karma" tracking (not tenant-visible)

**Estimated time:** 2-3 hours
**Impact:** HIGH - Tenant compliance tracking

---

#### BUILD 3: Cleaner Notes from Admin (For Next Clean)
**Files needed:**
- Database table: `pending_cleaner_notes` (NEW) 
- Update: `/app/admin/property-notes/page.tsx` - remove "no clean booked" blocker
- Add trigger: When clean is booked, attach pending notes

**Scope:**
- Admin can add note to property without active clean
- Note held in pending_cleaner_notes
- Auto-attaches to next clean when booked
- Cleaner sees it on job detail screen

**Estimated time:** 1-2 hours
**Impact:** HIGH - Better admin-to-cleaner communication

---

### PRIORITY 2: USABILITY IMPROVEMENTS (Build second - enhance experience)

#### BUILD 4: Rename "Week View" to "Diary"
**Files needed:**
- `/app/lettings/page.tsx` - Change label only

**Scope:**
- Change "Week View" header to "Diary"
- Update any help text referencing "week view"

**Estimated time:** 15 minutes
**Impact:** MEDIUM - Naming clarity

---

#### BUILD 5: Lead Logging in Lettings
**Files needed:**
- Database table: `lettings_leads` (NEW)
- Update: `/app/lettings/page.tsx` - add lead capture form

**Scope:**
- Form fields: name, email, phone, move-in date, budget, notes
- Save lead to database
- Admin can view leads
- Link lead to viewing when booked

**Estimated time:** 2 hours
**Impact:** MEDIUM - Lettings workflow

---

#### BUILD 6: Tenant Lightweight Feedback Option
**Files needed:**
- Database table: `tenant_feedback` (NEW)
- Update: `/app/tenant/page.tsx` - add feedback card
- New endpoint: `/api/tenant/send-feedback`

**Scope:**
- Simple 1-click feedback ("Everything good" / "Something to mention")
- If "something to mention" - text field pops up
- Auto-sends to admin/landlord
- Doesn't create maintenance ticket (simpler than reporting)

**Estimated time:** 1.5 hours
**Impact:** MEDIUM - Tenant communication

---

### PRIORITY 3: CONTRACTOR FEATURES (Build third - enables complex workflows)

#### BUILD 7: Contractor Job Completion Workflow
**Files needed:**
- Update: `/app/contractor/job/[jobId]/page.tsx`

**Scope:**
- "Complete this job" button on in-progress jobs
- Before/after photo prompt (optional)
- Cost prompt on completion (optional)
- Return-visit reason dropdown
- Return-visit uses branching questions
- Tenant auto-notification if no return needed
- Reassuring confirmation message

**Estimated time:** 3-4 hours
**Impact:** CRITICAL - Contractor can finish work

---

#### BUILD 8: Contractor Voice-to-Text Notes
**Files needed:**
- Update: `/app/contractor/job/[jobId]/page.tsx`
- Integrate: Web Speech API or Deepgram
- Add: `/api/ai/summarize-audio` (NEW)

**Scope:**
- Audio recording on job detail page
- AI transcribes + summarizes
- Contractor reviews before sending
- Clearly labels if going to tenant or admin

**Estimated time:** 2-3 hours
**Impact:** MEDIUM - Quality of life

---

#### BUILD 9: Contractor Photo Attachment (New Jobs)
**Files needed:**
- Update: `/app/admin/maintenance/new/page.tsx`

**Scope:**
- File upload field when creating job
- Store photo in Supabase storage
- Link to job record

**Estimated time:** 1 hour
**Impact:** MEDIUM - Better job context

---

### PRIORITY 4: COMPLIANCE & ADMIN (Build last - foundational)

#### BUILD 10: Fire Door & Smoke Alarm Shared Log
**Files needed:**
- Database tables: `compliance_logs`
- New admin page: `/app/admin/compliance-logs/page.tsx`
- New cleaner view: Access from cleaner dashboard

**Scope:**
- Admin adds check entry
- Cleaner adds check entry
- Continuous log per property
- Fields: checked by, date, notes, check type
- Cleaner can access only properties assigned to them

**Estimated time:** 2 hours
**Impact:** HIGH - Compliance documentation

---

### BUILD CHECKLIST

```
PRIORITY 1 (Critical):
- [ ] Tenant self-check prompts (3-4 hrs)
- [ ] Tenant acknowledgment notes (2-3 hrs)
- [ ] Cleaner notes from admin (1-2 hrs)
- [ ] Contractor job completion (3-4 hrs)

PRIORITY 2 (Usability):
- [ ] Rename Week View → Diary (15 min)
- [ ] Lead logging (2 hrs)
- [ ] Tenant feedback option (1.5 hrs)
- [ ] Fire door/smoke alarm log (2 hrs)

PRIORITY 3 (Nice-to-have):
- [ ] Voice-to-text notes (2-3 hrs)
- [ ] Photo attachment on new jobs (1 hr)
- [ ] Various contractor features

TOTAL ESTIMATED TIME: 20-25 hours
```

---

## EXECUTION PLAN

### Phase 1: Testing (Today)
1. Run TEST 1-10 above
2. Create 2-3 test contractor jobs for additional testing
3. Document results

### Phase 2: Building Priority 1 (Next 2 days)
1. Build all CRITICAL items
2. Test each
3. Verify working

### Phase 3: Building Priority 2-3 (Following days)
1. Build usability improvements
2. Build nice-to-haves
3. Full system test

### Phase 4: Final Verification
1. All 65 items from requirements verified
2. Full user testing with real data
3. Ready for production

---

## RESOURCES NEEDED

- Supabase migrations for new tables
- UI components for new pages
- API endpoints for data handling
- AI integration for voice/summaries (optional)

---

**Ready to start testing? Or would you like to adjust the priority?**
