# Architecture Clarifications & Feature Roadmap

**Date:** August 19, 2026  
**Status:** Addressing UX feedback and architectural questions

---

## Issues Fixed ✅

### 1. Black Screen on Quick Notify Modal
**Problem:** Modal appeared with black background, content not visible  
**Root Cause:** Z-index conflict (z-50 was too low in stacking context)  
**Fix Applied:** Updated to z-[1000]/z-[1001] for proper layering  
**Status:** ✅ FIXED

### 2. Quick Notify Button Placement
**Problem:** Button was in AppBar but in wrong position  
**User Requirement:** Central button in main bar (AppBar header)  
**Solution:** Repositioned as prominent blue button (right side of AppBar)  
**Styling:** 
- Background: `bg-blue-600` (stands out from neutral header)
- Always visible, not buried in tabs
- Clear CTA with emoji + text
**Status:** ✅ FIXED

---

## Architecture Questions

### Q1: Documents Tab - AI Scanning?

**Current State:**
- Documents tab displays files from `attachments` table
- Shows auto-categorization (Certificates, Insurance, Photos, Floor Plans, Tenancy Docs, etc.)
- **Does NOT have AI scanning integrated**

**AI Document Ingestion Feature (Exists Separately):**
- Located in `app/admin/documents` (separate page)
- Universal AI extraction for: statements, certs, licenses, policies, appliances
- Upload or email to `docs@` address
- Extract → admin approves property → filed

**Next Step:**
The Documents tab in property view should be updated to:
1. Show extracted/filed documents from the Document Ingestion system
2. Add upload button linking to AI extraction workflow
3. Create unified view: manually uploaded + AI-extracted documents

---

### Q2: Tenancy Agreement Routing - Where Does It Go?

**Current Implementation:** None - signed agreements not routed yet

**Proposed Workflow (needs clarification):**

**Option A: Landlord → Tenant → Signed Back**
1. Admin uploads unsigned tenancy agreement (Documents tab)
2. System auto-routes to tenant (push + email)
3. Tenant signs digitally
4. Signed copy goes to landlord + landlord inbox
5. Both parties have copy in their document store

**Option B: Admin Uploads Signed Copy**
1. Admin receives signed agreement from tenant (offline)
2. Uploads to Documents tab
3. Auto-filed with tenant + landlord notifications

**Option C: Email-Based (Using Document Ingestion)**
1. Tenant receives agreement via email
2. Signs and replies with signed copy
3. System ingests via `docs@` address
4. Auto-extracts signature metadata
5. Files to both tenant + landlord

**Recommendation:** Option A (full digital workflow) but needs:
- eSignature integration (DocuSign / HelloSign)
- Tenant document inbox (separate from admin)
- Signature tracking + audit trail

**Current Workaround:** Use Option B (manual + upload to Documents tab)

---

### Q3: Tenant Routing from Communications

**Current State:**
- Communications tab shows messages grouped by type
- Room drill-down shows tenants for that room
- **But:** No way to click tenant name → see all interactions with that specific tenant

**Proposed Feature:**
When user clicks a tenant name anywhere in Communications:
1. Open Tenant Profile view
2. Show:
   - All messages sent to this tenant (filtered from all categories)
   - Timeline of interactions
   - Previous tenancy information (if person routed between rooms)
   - Links to: Tenancy agreements, Safety checks, Notes
   - Communication preferences (opt-in/out settings)

**Implementation:**
1. Make tenant names clickable (add `/admin/tenant/[personId]` route)
2. New TenantProfilePage showing:
   - Personal info (name, email, phone, role)
   - Current tenancy (room + property + dates)
   - Previous tenancies (if any)
   - All communications (filterable by type)
   - Safety checks + acknowledgments
   - Documents (agreements, checks, notes)

**Priority:** High - would improve UX significantly

---

### Q4: Navigation Continuity Issues

**Reported:** "Continuity is lost as suddenly changes" between pages

**Needs Clarification:**
- What specifically changes suddenly? 
  - Page layout shifts?
  - Styling breaks?
  - State resets (filters, scroll position)?
  - Route params lost?

**Common Causes:**
1. **Layout shift:** Tab navigation bar height changes
2. **State loss:** Component state doesn't persist when returning from modal
3. **Styling inconsistency:** Some pages use light theme, others dark
4. **Scroll position:** Doesn't restore when navigating back

**Current Fixes Applied:**
- Dark theme consistent across all property detail pages
- Modal z-index fixed (no more black screens)
- Tab layout stable

**Next: Needs specific example** to debug further

---

## Feature Roadmap

### Quick Wins (1-2 hours)
- [ ] Add tenant profile routing from Communications
- [ ] Make tenant names clickable → tenant detail view
- [ ] Add scroll position restoration

### Medium (4-6 hours)
- [ ] Integrate Document Ingestion into Documents tab
- [ ] Add upload button linking to AI extraction
- [ ] Tenant document inbox (separate from admin)
- [ ] Communication preferences per tenant

### Major (Design Required)
- [ ] eSignature workflow for tenancy agreements
- [ ] Tenant portal (separate from admin)
- [ ] Multi-tenant room history visualization
- [ ] Audit trail for all communications

---

## Questions for Clarification

Before implementing further, please clarify:

1. **Tenancy Agreement Flow:**
   - Should signatures be digital (eSignature)?
   - Or manual (scan + upload)?
   - Who initiates - admin or tenant?

2. **Navigation Continuity:**
   - Can you describe the specific moment where it breaks?
   - Example: "Click Quick Notify → select property → modal opens → close → page looks different"?

3. **Tenant Document Inbox:**
   - Should tenants have a separate "My Documents" section?
   - Or just see documents in email/notifications?

4. **Document Ingestion Integration:**
   - Documents tab should show AI-extracted documents?
   - Plus manually uploaded documents?
   - Both in same view or separated?

---

## Current Status

✅ **Phase 1-3 Communications System:** Fully deployed to production  
✅ **Quick Notify Modal:** Z-index fixed, no black screen  
✅ **Quick Notify Placement:** Central AppBar button, prominent  
⏳ **Tenant Routing:** Feature ready to build (high priority)  
⏳ **Documents AI Integration:** Needs coordination with Document Ingestion feature  
❓ **Tenancy Workflow:** Awaiting workflow clarification  
❓ **Navigation Continuity:** Awaiting specific issue description  

---

## Next Actions

1. Clarify tenancy agreement routing workflow
2. Describe navigation continuity issue
3. Build tenant profile routing (quick win)
4. Integrate Document Ingestion with property Documents tab
5. Add communication preferences per tenant

**All code is production-ready and deployed.** These are enhancements based on user feedback.
