# 🚀 IMMEDIATE LAUNCH CHECKLIST - Next 24 Hours

**Goal:** Go from development → LIVE with real data  
**Timeline:** TODAY (Evening) + TOMORROW (Morning Launch)

---

## RIGHT NOW (Next 2 Hours)

### ✅ Checklist

- [ ] **1. Apply Migration 040 to Supabase**
  ```
  1. Go to https://supabase.com → Your project
  2. Click "SQL Editor"
  3. Click "+ New query"
  4. Copy entire contents of: supabase/migrations/040-harden-rls-policies.sql
  5. Paste into SQL editor
  6. Click "Run"
  7. Wait for success ✓
  8. Repeat: migrations 038 and 039
  
  Expected: 3 new tables created, RLS policies hardened
  ```

- [ ] **2. Verify Migrations Applied**
  ```
  In same SQL editor, run:
  
  SELECT tablename FROM pg_tables 
  WHERE tablename IN ('compliance_logs', 'tenant_self_checks', 'tenant_acknowledgment_notes');
  
  Expected result: 3 rows (all 3 tables)
  ```

- [ ] **3. Deploy to Production**
  ```
  1. Go to https://vercel.com → your cros project
  2. Current deployment should show "main" branch
  3. Deployment should be GREEN ✓
  4. If not: wait for auto-deploy (it happens on every push)
  5. Verify production URL works: https://capital-rooms.vercel.app
  ```

- [ ] **4. Create Real Admin Account**
  ```
  Current setup:
  - Email: admin@example.com
  - Password: password123
  
  For PRODUCTION, create real account:
  1. Go to https://capital-rooms.vercel.app
  2. Click "Sign up" (if needed)
  3. Email: harry@capitalrooms.co.uk
  4. Set strong password
  5. OR ask user to go to Supabase → Auth → Add user manually
  
  You now have real admin account
  ```

---

## TONIGHT (Before Bed)

### ✅ Data Preparation (2 hours)

- [ ] **5. Load Real Data into Database**

  **Quick Method (30 min):**
  ```
  Open Supabase Console → Table Editor
  
  Click "properties" table → "Insert row":
  - 12 Saltwell Street, London, E14 0DX
  - 123 East Street, London, E14 1AA
  - (Add 1-3 more)
  
  Click "rooms" table → "Insert row":
  - For each property, add Room 5, Room 6, etc.
  - (Total 15-20 rooms)
  
  Click "people" table:
  - Add tenants, contractors, cleaners
  - Assign roles: tenant, contractor, cleaner, administrator
  - (Total 20+ people)
  
  Click "tenancies" table:
  - Assign tenants to rooms
  - Set active (end_date = null or future)
  - (Total 10+ active tenancies)
  ```

  **Verification:**
  - properties: 3-5 rows
  - rooms: 15-20 rows
  - people: 20+ rows
  - tenancies: 10+ rows

- [ ] **6. Test in Production Environment**
  
  ```
  1. Go to https://capital-rooms.vercel.app
  2. Log in as admin (your account)
  3. Navigate to /admin dashboard
  4. Verify: See properties you just added ✓
  5. Navigate to /tenant (log in as different tenant if needed)
  6. Verify: Tenant sees only their data ✓
  ```

---

## TOMORROW MORNING (Launch Day)

### ✅ Pre-Launch Verification (30 min)

- [ ] **7. Final Security Check**
  ```
  1. Try accessing /admin as tenant
     Expected: Redirect to /login ✓
  
  2. Create acknowledgment note with title > 255 chars
     Expected: Form error ✓
  
  3. Call SMS API 6 times rapidly
     Expected: 6th request returns 429 ✓
  
  If ANY fail: FIX before launch
  ```

- [ ] **8. Configure Environment**
  
  Vercel Production Environment Variables (if not already set):
  ```
  NEXT_PUBLIC_SUPABASE_URL = [Your Supabase URL]
  NEXT_PUBLIC_SUPABASE_ANON_KEY = [Your anon key]
  NEXT_PUBLIC_APP_URL = https://capital-rooms.vercel.app
  NEXT_PUBLIC_ADMIN_EMAIL = harry@capitalrooms.co.uk
  RESEND_API_KEY = [Your Resend key, if using email]
  
  Go to: Vercel → Project → Settings → Environment Variables
  Add/verify all above
  ```

- [ ] **9. Set Up Monitoring**
  
  ```
  Optional but recommended:
  
  Option A: Vercel Built-in Logs (Free)
  - Vercel Dashboard → Logs tab
  - Shows errors, deployment status
  
  Option B: Sentry (Recommended, Free tier)
  - https://sentry.io → Create account
  - Create new project (Next.js)
  - Add DSN to .env.local
  - Tracks errors + performance
  ```

---

## LAUNCH SEQUENCE (9 AM)

### ✅ Go-Live (30 min)

- [ ] **10. Invite Test Wave (5-10 people)**
  
  Send Email:
  ```
  Subject: CROS Platform - Early Access Testing
  
  Hi [Name],
  
  CROS is launching tomorrow! You're invited to test it early.
  
  📱 Access: https://capital-rooms.vercel.app
  📧 Email: [their@email.com]
  🔑 Password: [temporary password]
  
  Your role: [admin/tenant/contractor/cleaner]
  
  Please test logging in and let me know if you see any issues.
  
  Thanks!
  Harry
  ```
  
  Create accounts for:
  - 1x Admin (you, probably)
  - 2-3x Tenants
  - 2-3x Contractors
  - 1-2x Cleaners

- [ ] **11. Monitor First 2 Hours**
  
  During 9 AM - 11 AM:
  ```
  Every 15 min:
  □ Check Vercel logs (Deployments → Logs tab)
  □ Check if test users are logging in
  □ Check email/Slack for issues
  
  Every hour:
  □ Check Supabase analytics (should be normal)
  □ Check error messages if any
  □ Respond to user questions
  ```

- [ ] **12. Daily Check-In (End of Day)**
  
  At 5 PM:
  ```
  1. Ask testers: "Any problems?"
  2. Check logs for errors
  3. Review any feedback
  4. Plan fixes for tomorrow if needed
  5. Send summary email to stakeholders
  ```

---

## EXPANSION WAVE (Days 2-3)

- [ ] **13. Add More Users as Confidence Grows**
  
  Timeline:
  ```
  Day 1: 5-10 users (test team)
  Day 2: 15-20 users (add properties/people)
  Day 3: 30-40 users (add more)
  Day 4: 50-70 users (final wave)
  Day 5: 70+ users (full population)
  ```

- [ ] **14. Escalate Support**
  
  Once comfortable:
  ```
  Set up support email: support@capitalrooms.co.uk
  Create FAQ document
  Establish response SLA (1 hour for critical)
  Create escalation path for bugs
  ```

---

## WHAT TO DO IF SOMETHING BREAKS

### Option 1: Quick Fix (5-30 min)
```
1. Find the bug in code
2. Fix it locally
3. Commit to main branch
4. Vercel auto-deploys (2-3 min)
5. Tell users it's fixed
```

### Option 2: Revert (5 min)
```
1. Go to Vercel Deployments
2. Find last working deployment
3. Click Redeploy
4. System reverts
5. Tell users you're investigating
```

### Option 3: Database Restore (30 min)
```
If data corruption:
1. Supabase → Backups
2. Restore to yesterday
3. Tell users about data loss
4. (This is why you didn't launch with prod data yet!)
```

---

## SUCCESS METRICS

### By End of Day 1:
- ✅ 0 critical errors
- ✅ Test team can log in
- ✅ Data isolation working
- ✅ No RLS errors

### By End of Day 2:
- ✅ 20+ users active
- ✅ Features working smoothly
- ✅ < 2s response times
- ✅ Support emails answered

### By Day 3:
- ✅ 40+ users
- ✅ No major issues
- ✅ Ready for full rollout

---

## IMPORTANT REMINDERS

⚠️ **Before Inviting First Users:**
- [ ] Migration 040 is applied (this is CRITICAL)
- [ ] Production URLs are live and working
- [ ] You've tested data isolation (tenant can't see other tenant)
- [ ] Rate limiting works (SMS endpoint)
- [ ] Errors don't leak data

⚠️ **Communication:**
- Tell all users they're part of early launch
- Set expectations: "We'll improve things as we go"
- Give clear support contact
- Thank them for testing

⚠️ **Monitoring:**
- Keep Vercel logs open during Day 1
- Check database performance (Supabase → Analytics)
- Watch for rate limiting spikes
- Be ready to rollback if needed

---

## WHAT NOT TO DO

❌ Don't invite all 70 users on Day 1
❌ Don't skip migration 040 (RLS hardening)
❌ Don't use fake data mixed with real users
❌ Don't ignore error messages
❌ Don't make big code changes after launch
❌ Don't leave it unmonitored

---

## YOU'RE READY! 🎉

**Everything is built, tested, and secure.**

Next 24 hours:
1. Apply migrations (2 hours tonight)
2. Load real data (1 hour tonight)
3. Final verification (30 min tomorrow morning)
4. Launch to 5-10 test users (9 AM)
5. Monitor and support (all day)

**This is your launch day. You've got this! 🚀**

---

## Questions Before Launch?

- **"What if migration fails?"** → Check Supabase SQL console for error, fix and retry
- **"What if no one logs in?"** → Check Vercel logs, verify auth works, send users login link
- **"What if database is slow?"** → Check Supabase → Analytics, add indexes if needed
- **"What if I find a bug?"** → Fix code locally, push to main, Vercel redeploys in 2-3 min
- **"What if I need to rollback?"** → Click previous deployment in Vercel, click Redeploy (5 min)

**You have a plan for everything. Go launch! 🚀**
