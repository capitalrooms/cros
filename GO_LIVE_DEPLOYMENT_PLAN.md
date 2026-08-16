# Go-Live Deployment Plan - CROS Production Launch

**Status:** 🟢 READY TO DEPLOY  
**Target Date:** 2026-08-15 (Tomorrow)  
**Users:** 70+ across multiple properties

---

## Phase 1: Pre-Deployment (TODAY - 2026-08-14)

### Step 1.1: Apply Database Migrations ⏱️ 30 min

**Action:** Apply all pending migrations to production Supabase

```
Supabase Console → SQL Editor → Copy/paste and run:

1. supabase/migrations/040-harden-rls-policies.sql
   - Removes permissive policies
   - Adds role-based validation

2. supabase/migrations/038-tenant-self-checks.sql
   - Creates tenant_self_checks table
   - Creates tenant_self_check_issues lookup table

3. supabase/migrations/039-tenant-acknowledgment-notes.sql
   - Creates tenant_acknowledgment_notes table
   - Adds RLS policies

4. supabase/migrations/037-compliance-logs.sql
   - Creates compliance_logs table
   - Adds RLS policies
```

**Verification:**
```sql
-- After each migration, run:
SELECT * FROM information_schema.tables 
WHERE table_name IN ('compliance_logs', 'tenant_self_checks', 'tenant_acknowledgment_notes')

-- Expected: 3 tables exist
-- If error: Roll back and debug
```

---

### Step 1.2: Verify Staging Environment ⏱️ 1 hour

**Action:** Deploy current code to staging URL

**Setup in Vercel:**
```
1. Create new project: "cros-staging"
2. Connect same GitHub repo
3. Set environment variables (same as production)
4. Deploy from `main` branch
5. URL: https://cros-staging.vercel.app
```

**Test in Staging:**
```
1. Login as admin@example.com / password123
   ✓ Should work (auth works)

2. Navigate to /admin/compliance-logs
   ✓ Should load (RLS policies work)

3. Create acknowledgment note
   ✓ Title > 255 chars → Error (validation works)
   ✓ Valid data → Saves (form validation works)

4. Try SMS endpoint 6 times
   ✓ 6th request → 429 Too Many Requests (rate limiting works)

5. Test tenant isolation
   ✓ Tenant1 views dashboard
   ✓ Does NOT see Tenant2's room viewing
```

**If any test fails:**
- Check error logs (Vercel dashboard)
- Fix code locally
- Redeploy to staging
- Re-test

---

### Step 1.3: Security Checklist ⏱️ 30 min

**Verify Before Going Live:**

- [ ] RLS policies applied (no `WITH CHECK (true)`)
- [ ] Input validation working (forms reject invalid data)
- [ ] Rate limiting working (429 responses)
- [ ] Admin pages redirect non-admin users
- [ ] Tenant data isolation verified
- [ ] HTTPS/SSL enabled (automatic on Vercel)
- [ ] Database backups configured (Supabase)
- [ ] Error monitoring active (Sentry or Vercel logs)
- [ ] Rate limits configured for SMS/email

---

### Step 1.4: Data Preparation ⏱️ 2 hours

**Action:** Seed production database with real data

**Real Data Needed:**
```
1. Properties (3-5 test properties)
   - Address, landlord, key safe info

2. Rooms (15-20 test rooms across properties)
   - Room name, property assignment

3. Tenants (20+ test tenants)
   - Names, emails, phone numbers
   - Assign to rooms

4. Cleaners (3-5)
   - Assign to properties

5. Contractors (5-10)
   - Areas of expertise

6. Admin users (2-3)
   - Email, password
```

**Method 1: Manual via Supabase Console**
```
1. Supabase Console → Table Editor
2. Click each table (properties, rooms, people, tenancies)
3. Click "Insert row"
4. Fill in data
5. Repeat for all
```

**Method 2: SQL Script (Faster)**
```sql
-- Insert properties
INSERT INTO properties (name, address, gas_safe_cert_expiry, electrical_cert_expiry)
VALUES 
  ('12 Saltwell Street', 'London, E14 0DX', '2027-08-14', '2026-02-14'),
  ('123 East Street', 'London, E14 1AA', '2027-06-01', '2027-01-01'),
  ('House A', 'Manchester', '2027-03-15', '2026-11-20');

-- Insert rooms (adjust property_id as needed)
INSERT INTO rooms (property_id, name)
SELECT id, 'Room 5' FROM properties WHERE name = '12 Saltwell Street'
UNION ALL
SELECT id, 'Room 6' FROM properties WHERE name = '12 Saltwell Street'
...
```

**Verification:**
```
Supabase Console → Table Editor:
- properties: 3-5 rows
- rooms: 15-20 rows
- people: 20+ rows (all roles mixed in)
- tenancies: 10+ active rows
```

---

## Phase 2: Soft Launch (Day 1 - 2026-08-15)

### Step 2.1: Invite Internal Test Team ⏱️ 30 min

**Who:** 5-10 people (you, admin, 2-3 tenants, 2-3 contractors, 1-2 cleaners)

**Email Template:**
```
Subject: CROS Platform - Testing Access

Hi [Name],

We're launching CROS, our new property management platform. 
Your role: [admin/tenant/contractor/cleaner]

📱 Access:
- URL: https://capital-rooms.vercel.app
- Email: [their@email.com]
- Password: [temporary password]

🎯 What to test:
- Log in successfully
- Navigate to your dashboard
- Complete your role-specific tasks
- Report any issues

❓ Having trouble? Reply to this email.

Thanks for testing!
– Harry
```

**Accounts to Create:**
```
Admin:        admin@example.com (you)
Tenant1:      tenant1@example.com
Tenant2:      tenant2@example.com
Contractor1:  contractor1@example.com
Cleaner1:     cleaner1@example.com
Landlord1:    landlord1@example.com
```

---

### Step 2.2: Monitor During Day 1 ⏱️ Active monitoring

**Hourly Checklist (Every hour, 8am-6pm):**

```
□ Check Vercel logs for errors
  Vercel Dashboard → cros → Deployments → Logs

□ Check Supabase usage
  Supabase Dashboard → Analytics
  - Database connections normal?
  - Query times < 500ms?
  - No rate limit warnings?

□ Check error tracking (if configured)
  Sentry Dashboard or Vercel logs
  - Any errors? Stack traces?
  - How many affected?

□ Ask testers: "Any issues?"
  (Email or Slack)
```

**If Error Found:**
```
1. Check error details
2. Find root cause
3. Fix locally
4. Commit and push
5. Vercel auto-deploys
6. Verify fix
7. Tell testers
```

---

### Step 2.3: Daily Standup (End of Day) ⏱️ 30 min

**Questions to Answer:**
- What worked well today?
- What didn't work?
- What needs fixing before wide launch?
- Any security issues?
- Any performance issues?

**If Major Issue Found:**
- Decide: Fix today or wait until tomorrow?
- If wait, notify all users of the issue
- Tell them workaround (if exists)

---

## Phase 3: Full Rollout (Day 2-3 - 2026-08-16 onwards)

### Step 3.1: Expand User Base ⏱️ Gradual rollout

**Day 1 (Today):** 5-10 test users  
**Day 2:** 15-20 users (add 1-2 properties)  
**Day 3:** 30-40 users (add 3-4 properties)  
**Day 4:** 50-70 users (add 5+ properties)  
**Day 5+:** All users (70+)

**Why gradual?**
- Catch issues before they hit everyone
- Give support time to help users
- Monitor system performance at each stage
- Build confidence

---

### Step 3.2: User Onboarding ⏱️ For each wave

**When Adding New Users:**

**Send Onboarding Email:**
```
Subject: Welcome to CROS - Your Property Management Platform

Hi [User],

Welcome to CROS! Here's how to get started.

📱 LOGIN
- Go to: https://capital-rooms.vercel.app
- Email: [your@email.com]
- Password: [temporary - change on first login]

👤 YOUR ROLE: [Admin/Tenant/Contractor/Cleaner]

🎯 NEXT STEPS:
[Role-specific instructions]

ADMIN:
1. Go to /admin dashboard
2. Review properties and tenants
3. Create first maintenance job
4. Invite contractors

TENANT:
1. Go to /tenant dashboard
2. Review upcoming appointments
3. Report maintenance issues if needed
4. Review property notes

CONTRACTOR:
1. Go to /contractor dashboard
2. View assigned jobs
3. Book first job
4. Mark complete with photos

CLEANER:
1. Go to /cleaner dashboard
2. View cleaning schedule
3. Log completion

📞 NEED HELP?
- Email: support@capitalrooms.co.uk
- Call: [your phone]
- FAQ: https://capitalrooms.co.uk/help

Welcome aboard!
```

---

### Step 3.3: Live Support ⏱️ During rollout

**During Each Wave:**
- Be available for questions
- Respond to emails within 1 hour
- Help with password resets
- Explain features
- Gather feedback

**Common Issues:**

**"I can't log in"**
→ Check email is correct, reset password via /forgot-password

**"Where do I find X?"**
→ Walk them through UI, send screenshot

**"It's slow"**
→ Check Vercel/Supabase status, restart browser, clear cache

**"I see a bug"**
→ Get details, reproduce locally, fix, redeploy

---

## Phase 4: Production Optimization (Day 3+)

### Step 4.1: Performance Monitoring ⏱️ Continuous

**Monitor These Metrics:**

```
Database Performance:
- Query latency: Target < 200ms
- Connection count: Track for spikes
- Storage usage: Track growth

Server Performance:
- Response time: Target < 2s
- Error rate: Target 0%
- Uptime: Target 99.9%

User Activity:
- Daily active users
- Feature usage (maintenance reports, viewings, etc.)
- Common errors (from logs)
```

**Tools to Set Up:**

**Supabase Analytics** (Free, built-in)
- Shows database performance
- Query insights
- Storage tracking

**Vercel Analytics** (Built-in)
- Shows API performance
- Error tracking
- Deployment history

**Sentry** (Optional, $29/month)
- Error tracking
- Performance monitoring
- Session replay

---

### Step 4.2: Database Optimization ⏱️ Day 3

**Create Indexes** (if not already done):
```sql
-- Make these queries fast
CREATE INDEX idx_tenancies_tenant_id_property 
ON tenancies(tenant_id, property_id);

CREATE INDEX idx_viewings_date_property 
ON viewings(viewing_date, property_id);

CREATE INDEX idx_maintenance_status_property 
ON maintenance_tickets(status, property_id, booked_date);

CREATE INDEX idx_tenant_self_checks_response_date 
ON tenant_self_checks(response_received_at DESC, property_id);
```

**Monitor Slow Queries:**
```
Supabase Console → Logs
- Look for queries > 500ms
- Optimize or add indexes
```

---

### Step 4.3: Scaling Plan (If Needed)

**For 70+ Users:**
Current setup handles this fine.

**For 200+ Users:**
- Upgrade Supabase to Pro ($25/mo)
- Upgrade Vercel Pro ($20/mo) if needed
- Enable database connection pooling

**For 500+ Users:**
- Consider database replication
- Set up CDN for assets
- Implement caching layer

---

## Phase 5: Post-Launch (Ongoing)

### Step 5.1: Weekly Checks

**Every Monday Morning:**
```
□ Check Vercel logs for errors
□ Check database performance
□ Check user feedback/support emails
□ Review any new issues
□ Plan fixes for the week
```

---

### Step 5.2: Monthly Maintenance

**First Friday of Each Month:**
```
□ Review security logs
□ Check for updates (Next.js, deps)
□ Backup verification
□ User feedback summary
□ Plan next month's improvements
```

---

## Critical Configuration Checklist

### Email & Notifications
- [ ] RESEND_API_KEY configured (for completion emails)
- [ ] NEXT_PUBLIC_ADMIN_EMAIL set
- [ ] Email templates look good

### SMS (Optional)
- [ ] TWILIO_ACCOUNT_SID configured (if using SMS)
- [ ] TWILIO_AUTH_TOKEN configured
- [ ] TWILIO_PHONE_NUMBER configured
- [ ] Test SMS sends work

### Authentication
- [ ] Supabase project configured
- [ ] NEXT_PUBLIC_SUPABASE_URL set
- [ ] NEXT_PUBLIC_SUPABASE_ANON_KEY set
- [ ] Password reset emails work

### Deployment
- [ ] Vercel project connected to GitHub
- [ ] Auto-deploy on main branch enabled
- [ ] Environment variables all set
- [ ] Production URL working

### Monitoring
- [ ] Vercel logs accessible
- [ ] Supabase console accessible
- [ ] Error tracking configured (Sentry recommended)
- [ ] Database backups enabled (Supabase auto-backs up)

---

## Rollback Plan (If Critical Issue Found)

**If Major Issue:**

```
Option 1: Revert Last Deployment (5 min)
- Vercel Dashboard → Deployments
- Click previous working version
- Click "Redeploy"
- Notify users

Option 2: Hotfix (15-30 min)
- Fix code locally
- Commit to main
- Vercel auto-deploys
- Notify users

Option 3: Database Rollback (30 min)
- Supabase has daily backups
- Restore to previous day
- Notify users about data loss
```

**When to Use Each:**
- Revert: Code bug, UI issue
- Hotfix: Quick 1-line fix
- Restore: Data corruption, major issue

---

## Success Criteria

### Day 1 (Soft Launch)
- ✅ Test team can log in
- ✅ No 500 errors
- ✅ RLS policies working (data isolation OK)
- ✅ Validation working (forms reject bad data)

### Day 2 (20 Users)
- ✅ 0 critical errors
- ✅ < 2s response time
- ✅ Users reporting good experience
- ✅ Support emails answered

### Day 3 (40 Users)
- ✅ System stable
- ✅ No performance issues
- ✅ All features working
- ✅ Ready for wider launch

### Day 5+ (70+ Users)
- ✅ 99%+ uptime
- ✅ < 1s average response
- ✅ All users productive
- ✅ System ready for growth

---

## Support Handoff

### Create Support System

**Email:** support@capitalrooms.co.uk
- Responds to all inquiries
- Escalates bugs to you
- Provides first-level help

**FAQ Document:**
```
- How do I log in?
- How do I reset my password?
- Where do I find [feature]?
- Why can't I [action]?
- What should I do if [scenario]?
```

**Escalation Path:**
```
User → Support Email
  ↓ (if user issue)
First-level help
  ↓ (if still stuck)
Email you
  ↓ (if bug)
Fix code
  ↓ 
Redeploy
  ↓
Follow up with user
```

---

## Timeline Summary

| Phase | Duration | Actions | Status |
|-------|----------|---------|--------|
| Pre-Deployment | Today (8h) | Apply migrations, test staging, prep data | 🟢 READY |
| Soft Launch | Tomorrow (1d) | 5-10 test users, daily monitoring | → Next |
| Wave 2 | Day 2-3 (2d) | 20-40 users, support | → Following |
| Wave 3 | Day 3-4 (2d) | 50-70 users, optimization | → Following |
| Full Launch | Day 5 | All users, production ready | → Following |
| Ongoing | Forever | Weekly checks, monthly maintenance | → Continuous |

---

## Emergency Contacts

**During Launch:**
- Your phone: [Your phone]
- Your email: harry@capitalrooms.co.uk
- Slack: (if available)

**For Urgent Issues:**
- Database issue: Contact Supabase support
- Server issue: Contact Vercel support
- Email delivery: Contact Resend support

---

## Post-Launch Improvements (Not Blocking)

These can happen AFTER going live:

- [ ] Integrate actual Twilio SMS (currently just logs)
- [ ] Set up more comprehensive monitoring (Sentry paid)
- [ ] Add audit logging middleware
- [ ] Implement additional caching
- [ ] Add dark mode toggle
- [ ] Build mobile app wrapper
- [ ] Add offline sync capability

---

## Final Checklist Before Going Live

- [ ] Migration 040 applied to Supabase
- [ ] Staging environment tested and working
- [ ] Production environment configured
- [ ] Real data loaded into database
- [ ] Email notifications working
- [ ] SMS configured (or disabled knowingly)
- [ ] Error monitoring set up
- [ ] Backups verified
- [ ] Support process documented
- [ ] Rollback plan understood
- [ ] All team members briefed
- [ ] Go-live date confirmed with all stakeholders

---

## READY TO LAUNCH? 🚀

When all checkboxes are complete, you're ready to:

1. ✅ Click "Deploy to Production" on Vercel
2. ✅ Send test wave invitations
3. ✅ Monitor during Day 1
4. ✅ Expand to full user base Days 2-5
5. ✅ Celebrate! 🎉
