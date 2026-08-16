# 🚀 DEPLOYMENT GUIDE - PHASE 1 COMPLETE

**Date:** August 13, 2026  
**Status:** Ready for production deployment  
**Estimated time:** 30-45 minutes  
**Risk level:** Low (schema only, no data loss)

---

## PRE-DEPLOYMENT CHECKLIST

- [ ] All team members notified
- [ ] Database backup taken (if production)
- [ ] Read-only access for 30 mins during deployment
- [ ] Monitoring/alerting active

---

## STEP 1: DEPLOY MIGRATIONS TO SUPABASE

**Order is CRITICAL - deploy in sequence:**

### Migration 031: Tenant Self-Checks
**File:** `/supabase/migrations/031-create-tenant-self-checks.sql`

**Contains:**
- `tenant_self_checks` table (check requests + responses)
- `tenant_self_check_issues` lookup table (fire door/smoke alarm issue types)
- 6 indexes for optimized queries
- RLS policies (tenants read own, admin reads all, admin can create)

**Deploy:**
```bash
# In Supabase Console:
1. Go to SQL Editor
2. Paste entire migration 031 content
3. Click "Run"
4. Verify success (no errors)
```

**Verify:**
```sql
-- Confirm tables exist
SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' 
AND table_name IN ('tenant_self_checks', 'tenant_self_check_issues');

-- Confirm issue types inserted
SELECT COUNT(*) FROM public.tenant_self_check_issues;
-- Expected: 11 rows (6 fire door + 5 smoke alarm)
```

---

### Migration 032: Job Completion Fields
**File:** `/supabase/migrations/032-add-job-completion-fields.sql`

**Contains:**
- 11 new fields on `maintenance_tickets` (cost, photos, return visit, etc.)
- `return_visit_reasons` lookup table (7 standard reasons)
- `job_completion_log` audit table
- 5 indexes
- RLS policies (contractors update own jobs, admin views all)

**Deploy:**
```bash
# In Supabase Console SQL Editor:
1. Paste entire migration 032 content
2. Click "Run"
3. Verify success
```

**Verify:**
```sql
-- Confirm columns added to maintenance_tickets
SELECT column_name FROM information_schema.columns 
WHERE table_name = 'maintenance_tickets' 
AND column_name IN ('completed_at', 'cost', 'return_visit_needed');

-- Confirm return visit reasons inserted
SELECT COUNT(*) FROM public.return_visit_reasons;
-- Expected: 7 rows
```

---

### Migration 033: Property Compliance Tracking
**File:** `/supabase/migrations/033-property-compliance-tracking.sql`

**Contains:**
- `property_compliance_summary` view (property-level overview)
- `property_photo_requests` table (bulk photo requests)
- `photo_request_responses` linking table
- `property_compliance_reports` table (monthly summaries)
- 7 indexes
- RLS policies (admin can create/view/update)

**Deploy:**
```bash
# In Supabase Console SQL Editor:
1. Paste entire migration 033 content
2. Click "Run"
3. Verify success
```

**Verify:**
```sql
-- Confirm view created
SELECT table_name FROM information_schema.views 
WHERE table_schema = 'public' AND table_name = 'property_compliance_summary';

-- Confirm tables created
SELECT table_name FROM information_schema.tables 
WHERE table_schema = 'public' 
AND table_name IN ('property_photo_requests', 'photo_request_responses', 'property_compliance_reports');
```

---

### Migration 034: Cleaner Notes + Internal Notes
**File:** `/supabase/migrations/034-cleaner-notes-and-internal-notes.sql`

**Contains:**
- `pending_cleaner_notes` table (pending auto-attach)
- `lettings_lead_notes` table (internal lead coordination)
- `is_internal` column added to `property_notes`
- `attach_pending_cleaner_notes()` trigger function
- `attach_pending_notes_trigger` on cleans table
- 5 indexes
- Updated RLS policies (enforce internal note privacy)

**Deploy:**
```bash
# In Supabase Console SQL Editor:
1. Paste entire migration 034 content
2. Click "Run"
3. Verify success
```

**Verify:**
```sql
-- Confirm tables created
SELECT table_name FROM information_schema.tables 
WHERE table_schema = 'public' 
AND table_name IN ('pending_cleaner_notes', 'lettings_lead_notes');

-- Confirm is_internal column added
SELECT column_name FROM information_schema.columns 
WHERE table_name = 'property_notes' AND column_name = 'is_internal';

-- Confirm trigger exists
SELECT trigger_name FROM information_schema.triggers 
WHERE trigger_name = 'attach_pending_notes_trigger';
```

---

## STEP 2: VERIFY ALL MIGRATIONS DEPLOYED

```sql
-- Run this to see all tables created:
SELECT table_name FROM information_schema.tables 
WHERE table_schema = 'public' 
ORDER BY table_name;

-- Expected new tables:
-- - job_completion_log
-- - lettings_lead_notes
-- - pending_cleaner_notes
-- - photo_request_responses
-- - property_compliance_reports
-- - property_photo_requests
-- - property_compliance_summary (view)
-- - return_visit_reasons
-- - tenant_self_check_issues
-- - tenant_self_checks
```

---

## STEP 3: ENABLE RLS ON ALL NEW TABLES

Supabase should auto-enable from migrations, but verify:

```sql
-- Check RLS is enabled
SELECT tablename, rowsecurity FROM pg_tables 
WHERE schemaname = 'public' 
AND tablename IN ('tenant_self_checks', 'pending_cleaner_notes', 'property_photo_requests', 'lettings_lead_notes');

-- All should show: rowsecurity = true
```

---

## STEP 4: VERIFY RLS POLICIES

```sql
-- List all policies for each table
SELECT schemaname, tablename, policyname 
FROM pg_policies 
WHERE schemaname = 'public'
ORDER BY tablename;

-- Should see policies for:
-- - tenant_self_checks (3 policies)
-- - return_visit_reasons (1 policy)
-- - job_completion_log (3 policies)
-- - property_photo_requests (4 policies)
-- - photo_request_responses (2 policies)
-- - property_compliance_reports (2 policies)
-- - pending_cleaner_notes (4 policies)
-- - lettings_lead_notes (3 policies)
```

---

## STEP 5: TEST WITH ADMIN USER

After deployment, log in as admin and verify:

1. **Navigate to admin dashboard**
   - Should see all navigation cards
   - New cards: "Tenant Safety Checks", "Property Compliance Dashboard"

2. **Try posting a property note**
   - Three options should appear: Tenants, Cleaner, Internal ✅
   - Try each type - should save successfully

3. **Check tenant dashboard**
   - "Safety Checks" card should appear
   - Click it → Should navigate to safety checks page

4. **Verify navigation**
   - Admin dashboard → "Tenant Safety Checks" link works
   - Admin dashboard → "Property Compliance Dashboard" link works

---

## STEP 6: TEST DATA CREATION (OPTIONAL)

To test workflows with sample data:

```sql
-- Create sample pending cleaner note
INSERT INTO public.pending_cleaner_notes 
  (property_id, title, content, created_by)
VALUES 
  ('property-id-here', 'Extra oven clean', 'Please give oven extra attention', 'user-id-here');

-- Create sample safety check request
INSERT INTO public.tenant_self_checks 
  (tenancy_id, property_id, room_id, check_type, frequency, request_sent_at)
VALUES 
  ('tenancy-id-here', 'property-id-here', 'room-id-here', 'fire_door', 'monthly', NOW());

-- Create sample return visit reason
-- (Already seeded in migration, just verify)
SELECT * FROM public.return_visit_reasons LIMIT 5;
```

---

## STEP 7: UPDATE ENVIRONMENT VARIABLES

Add to your `.env.local` and Vercel:

```env
# Cron job secret for sending safety check prompts
CRON_SECRET=your-secure-random-string-here

# Notification preferences
PUSH_NOTIFICATIONS_ENABLED=true
EMAIL_NOTIFICATIONS_ENABLED=true

# Optional: SMS (if using Twilio for SMS confirmations)
# TWILIO_ACCOUNT_SID=your-account-sid
# TWILIO_AUTH_TOKEN=your-auth-token
# TWILIO_PHONE_NUMBER=your-twilio-number
```

---

## STEP 8: SETUP CRON JOB (OPTIONAL BUT RECOMMENDED)

To automatically send monthly safety check prompts:

**Using Vercel Cron:**

Create `.vercel/crons.json`:
```json
{
  "crons": [{
    "path": "/api/cron/send-safety-check-prompts",
    "schedule": "0 9 1 * *"
  }]
}
```

**Using External Cron Service (e.g., AWS CloudWatch, Google Cloud Scheduler):**

```bash
# Daily at 9am GMT
curl -X POST https://your-app.vercel.app/api/cron/send-safety-check-prompts \
  -H "Content-Type: application/json" \
  -H "x-cron-secret: your-secret-here" \
  -d '{}'
```

**What it does:**
- Runs daily at 9am
- Sends fire door & smoke alarm check prompts to all active tenants
- Tenants get notified to check their property
- Responses tracked in `tenant_self_checks` table

---

## STEP 9: TEST NOTIFICATIONS (OPTIONAL)

If you have a test user, verify notifications work:

1. Log in as test admin
2. Create a safety check: `INSERT INTO tenant_self_checks ...`
3. Check test tenant's notification inbox
4. Should see: "🚪 Fire Door Check" or "🚨 Smoke Alarm Check"

---

## POST-DEPLOYMENT CHECKLIST

- [ ] All 4 migrations deployed successfully
- [ ] No error messages in SQL console
- [ ] All tables exist in database
- [ ] RLS policies enabled on all new tables
- [ ] Admin can see new navigation cards
- [ ] Admin can create all 3 types of property notes
- [ ] Tenant dashboard shows safety checks section
- [ ] Property compliance dashboard loads (when logged in)
- [ ] Cleaner notes auto-attach logic visible (test when clean booked)
- [ ] No errors in Vercel logs

---

## ROLLBACK PLAN (If needed)

If something breaks, rollback migrations in reverse order:

```sql
-- Drop tables and functions (CAREFUL!)
DROP TRIGGER IF EXISTS attach_pending_notes_trigger ON public.cleans CASCADE;
DROP FUNCTION IF EXISTS attach_pending_cleaner_notes() CASCADE;
DROP TABLE IF EXISTS lettings_lead_notes CASCADE;
DROP TABLE IF EXISTS pending_cleaner_notes CASCADE;
DROP TABLE IF EXISTS property_compliance_reports CASCADE;
DROP TABLE IF EXISTS photo_request_responses CASCADE;
DROP TABLE IF EXISTS property_photo_requests CASCADE;
DROP VIEW IF EXISTS property_compliance_summary CASCADE;
DROP TABLE IF EXISTS return_visit_reasons CASCADE;
DROP TABLE IF EXISTS job_completion_log CASCADE;
ALTER TABLE public.maintenance_tickets DROP COLUMN IF EXISTS completed_at CASCADE;
ALTER TABLE public.maintenance_tickets DROP COLUMN IF EXISTS completed_by CASCADE;
ALTER TABLE public.maintenance_tickets DROP COLUMN IF EXISTS completion_notes CASCADE;
ALTER TABLE public.maintenance_tickets DROP COLUMN IF EXISTS photo_before_url CASCADE;
ALTER TABLE public.maintenance_tickets DROP COLUMN IF EXISTS photo_after_url CASCADE;
ALTER TABLE public.maintenance_tickets DROP COLUMN IF EXISTS cost CASCADE;
ALTER TABLE public.maintenance_tickets DROP COLUMN IF EXISTS cost_notes CASCADE;
ALTER TABLE public.maintenance_tickets DROP COLUMN IF EXISTS return_visit_needed CASCADE;
ALTER TABLE public.maintenance_tickets DROP COLUMN IF EXISTS return_visit_reason CASCADE;
ALTER TABLE public.maintenance_tickets DROP COLUMN IF EXISTS return_visit_notes CASCADE;
ALTER TABLE public.maintenance_tickets DROP COLUMN IF EXISTS return_visit_date_estimate CASCADE;
ALTER TABLE public.property_notes DROP COLUMN IF EXISTS is_internal CASCADE;
DROP TABLE IF EXISTS tenant_self_check_issues CASCADE;
DROP TABLE IF EXISTS tenant_self_checks CASCADE;
```

---

## ESTIMATED TIMELINE

| Step | Time | Notes |
|------|------|-------|
| Deploy Migration 031 | 2 min | Tenant self-checks |
| Deploy Migration 032 | 2 min | Job completion |
| Deploy Migration 033 | 2 min | Compliance tracking |
| Deploy Migration 034 | 3 min | Cleaner notes + internal |
| Verify all tables | 3 min | Run verification queries |
| Test admin UI | 5 min | Click through new features |
| Setup cron (optional) | 5 min | Configure scheduling |
| Final verification | 10 min | Smoke test all features |
| **TOTAL** | **30-45 min** | **Ready for use** |

---

## SUCCESS INDICATORS

After deployment, the system should:

✅ Accept tenant safety check responses  
✅ Show fire door & smoke alarm status per property  
✅ Allow contractors to complete jobs with details  
✅ Auto-attach pending cleaner notes when jobs are booked  
✅ Keep internal admin notes private from users  
✅ Display property compliance dashboard with bulk photo requests  
✅ Send notifications to tenants about checks and job completions  
✅ Log all actions for audit trail  

---

## SUPPORT

If deployment issues occur:

1. Check Supabase logs: Dashboard → Logs
2. Verify SQL syntax in migrations
3. Check RLS policies are properly enabled
4. Verify no conflicting triggers/functions
5. Rollback and retry if needed

---

**Deployment Ready. Proceed when ready.**

Estimated production uptime impact: **0 minutes** (schema-only changes)  
Expected new users to try features: **Immediately after deployment**  
Monitoring period: **24 hours** (watch for errors/issues)
