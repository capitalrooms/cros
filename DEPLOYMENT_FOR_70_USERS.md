# Deployment Architecture for 70+ Users

## SHORT ANSWER

**NO, this does NOT need to go on the app store.**

**Why:** This is a web app, not a native mobile app. It's deployed to the web and accessed via browser URL, like Gmail, Slack, or Notion.

---

## Architecture Decision

### Current Setup (CORRECT ✅)
```
Users → Browser → https://capital-rooms.vercel.app → Supabase
         (any device)  (your Vercel URL)            (database)
```

**Cost:** ~$50-200/month total  
**Scale:** 70-1000+ users simultaneously  
**Updates:** Instant (no manual updates needed)

---

### Why NOT App Store?

| Factor | Web App | App Store |
|--------|---------|-----------|
| **Cost** | $50/mo | $500/mo + $5k setup |
| **Review Time** | Instant | 1-3 weeks per update |
| **Update Speed** | Real-time | Manual user upgrade |
| **Maintenance** | Central (backend) | Per-platform |
| **Offline** | Basic (Service Worker) | Full offline sync |
| **Push Notifications** | ✅ Works | ✅ Better support |
| **Device Access** | Limited (camera OK) | Full (GPS, contacts) |
| **Teams Size** | Best for <500 | Overkill for <500 |

**For 70 users:** Web app is PERFECT ✅

---

## How 70+ Users Access CROS

### Day 1: Admin Invites Users
```
Admin invites tenant1@capitalrooms.co.uk
    ↓
Tenant clicks email link
    ↓
Tenant goes to https://capital-rooms.vercel.app
    ↓
Tenant signs up / logs in
    ↓
Tenant sees dashboard
    ↓
Can add to home screen (looks like app)
```

### On Tenant's Phone

**iPhone:**
```
Safari → https://capital-rooms.vercel.app
         (webpage in browser)

OR

Add to Home Screen:
  Tap Share → Add to Home Screen
  → "CROS" icon appears on home screen
  → Tap it → Opens in standalone mode (looks like app)
```

**Android:**
```
Chrome → https://capital-rooms.vercel.app
         (webpage in browser)

OR

Chrome: "Add CROS to home screen" prompt
  → Tap "Install"
  → "CROS" icon appears on home screen
  → Tap it → Standalone app view
```

---

## Current Deployment Status

### ✅ Already Working
- [x] Next.js build optimized
- [x] Vercel deployment configured
- [x] HTTPS/SSL enabled
- [x] Service Worker for offline (partially)
- [x] Push notifications ready
- [x] Database auto-scaling

### ⚠️ Before 70+ Users

#### 1. Optimize Database Indexes
```sql
-- Run in Supabase SQL Editor:

-- Tenancies (most frequently filtered)
CREATE INDEX IF NOT EXISTS idx_tenancies_tenant_id_property 
ON tenancies(tenant_id, property_id);

-- Viewings (calendar queries)
CREATE INDEX IF NOT EXISTS idx_viewings_date_property 
ON viewings(viewing_date, property_id);

-- Maintenance (status filters)
CREATE INDEX IF NOT EXISTS idx_maintenance_status_property 
ON maintenance_tickets(status, property_id, booked_date);

-- Safety checks (daily response queries)
CREATE INDEX IF NOT EXISTS idx_tenant_self_checks_response_date 
ON tenant_self_checks(response_received_at DESC, property_id);
```

**Why:** Database queries will be slower as record count grows  
**Cost:** Negligible storage increase  
**Benefit:** 10x faster queries

---

#### 2. Configure Caching
```
File: vercel.json
```json
{
  "builds": [
    { "src": "package.json", "use": "@vercel/next" }
  ],
  "headers": [
    {
      "source": "/api/(.*)",
      "headers": [
        { "key": "Cache-Control", "value": "s-maxage=10, stale-while-revalidate=60" }
      ]
    },
    {
      "source": "/images/(.*)",
      "headers": [
        { "key": "Cache-Control", "value": "public, max-age=31536000, immutable" }
      ]
    }
  ]
}
```

---

#### 3. Set Up Monitoring

**Vercel Dashboard:**
- ✅ Already shows: deploy status, error rate, latency
- Check every week during first month

**Supabase Dashboard:**
- Monitor: Database connections, query latency, storage
- Alert if queries > 500ms

**Third-party Tools (Recommended):**
```
Option A: Sentry (error tracking)
  - Cost: Free tier fine
  - Setup: Add to package.json
  
Option B: LogRocket (session replay)
  - Cost: $99/mo
  - Useful for debugging user issues
  
Option C: Datadog (all-in-one)
  - Cost: $15/month minimum
  - Best for scaling
```

---

#### 4. Test Load Capacity

**Before inviting 70 users:**

```bash
# Load test: 50 concurrent users, 5 min duration
npx k6 run load-test.js

# Script: load-test.js
import http from 'k6/http';
import { check, sleep } from 'k6';

export let options = {
  vus: 50,
  duration: '5m',
};

export default function () {
  // Simulate user login
  let res = http.post('https://capital-rooms.vercel.app/api/auth/login', {
    email: 'admin@example.com',
    password: 'password123',
  });
  
  check(res, { 'login': (r) => r.status === 200 });
  
  // Simulate browsing pages
  res = http.get('https://capital-rooms.vercel.app/admin');
  check(res, { 'admin page': (r) => r.status === 200 });
  
  res = http.get('https://capital-rooms.vercel.app/lettings');
  check(res, { 'lettings page': (r) => r.status === 200 });
  
  sleep(2);
}
```

**Expected Results:**
- 50 users → <2s response time ✅
- No 500 errors ✅
- Database handles queries ✅

---

## Rollout Plan for 70+ Users

### Week 1: Soft Launch (10 Users)
```
✓ Admin (you)
✓ Lettings Agent (Jacob)
✓ 5 Tenants (test each feature)
✓ 2 Cleaners (test cleans)
✓ 1 Landlord (test property access)

Daily checklist:
- [ ] Check error logs
- [ ] Monitor page load times
- [ ] Test key workflows manually
- [ ] Ask testers for bugs
```

### Week 2: Invite 2x (20 Users)
```
Total: 20 users across 3-4 properties

Monitor:
- [ ] Database performance
- [ ] API response times
- [ ] User feedback on stability

Fix any critical bugs found
```

### Week 3: Full Rollout (70+ Users)
```
After stability confirmed:
- [ ] Invite all remaining users
- [ ] Send onboarding email with screenshots
- [ ] Provide phone support first week
- [ ] Daily standup with admins

Monitor:
- [ ] Real user sessions
- [ ] Error rates
- [ ] Feature usage patterns
```

---

## Hosting Cost Breakdown

### Vercel (Compute/Hosting)
```
Free tier: ✅ Enough for 70-100 users
- 100 GB bandwidth/month
- 100 deployment/month
- Serverless functions free

Cost: $0 initially, upgrade to Pro ($20/mo) if 100+ concurrent users
```

### Supabase (Database/Auth)
```
Free tier: ✅ Enough for 70 users
- 500MB database
- 2GB data transfer/month
- Unlimited API requests (rate limited)

Cost: $0 initially, upgrade to Pro ($25/mo) at 5GB database
```

### SMS (Twilio - Optional)
```
If using SMS for viewing confirmations:
- $0.02 per outbound SMS
- 70 users × ~5 SMS/month = ~$7/month
- Add to Twilio account, enter API keys

Cost: ~$50-100/month
```

### Email (SendGrid - Optional)
```
If using for password resets, notifications:
- Free tier: 100 emails/day
- 70 users × 30 days max = 2100 emails/month (may exceed)

Cost: $30/mo for 20k emails
```

### **Total Monthly Cost**
```
Vercel:      $0-20
Supabase:    $0-25
SMS:         $0-50 (optional)
Email:       $0-30 (optional)
             ────────────
             $0-125/month

For small teams: $0 (free tier works)
For scaling:    ~$100/month
```

---

## Security Checklist Before Production

### Authentication
- [ ] OAuth2/SSO tested (if using Google Sign-In)
- [ ] Password reset tested with real email
- [ ] Session timeout configured (30 min idle)
- [ ] Account lockout after 5 failed logins

### Authorization
- [ ] RLS policies tested with 4+ roles
- [ ] Tenant cannot see other tenants' data
- [ ] Cleaner cannot access admin pages
- [ ] API calls include proper role checks

### Data Protection
- [ ] HTTPS enforced (should be automatic on Vercel)
- [ ] No sensitive data in logs
- [ ] Audit log captures: who, what, when
- [ ] Database encrypted at rest (Supabase default)

### Incident Response
- [ ] Error monitoring set up (Sentry or similar)
- [ ] Alert rules configured
- [ ] On-call rotation established (if needed)
- [ ] Backup/restore procedure documented

---

## Progressive Web App (PWA) Setup

Your app is already PWA-ready! Users can:

### iPhone
```
1. Open Safari
2. Tap Share
3. Add to Home Screen
4. "CROS" appears on home screen
5. Tap to open full-screen
```

### Android
```
1. Open Chrome
2. See "Install CROS" prompt
3. Tap Install
4. "CROS" appears on home screen
5. Tap to open full-screen
```

### Offline Support
```
Already implemented:
- Service Worker caches key pages
- App loads offline (read-only)
- Queues actions until online

Test:
1. Navigate to /tenant dashboard
2. Open DevTools → Network → Offline
3. Page still loads (cached)
4. Try editing → queues action
5. Go back online → syncs
```

---

## What to Tell 70+ Users

### Email Invite Template

```
Subject: Welcome to CROS – Your Property Management Portal

Hi [Name],

We're excited to invite you to CROS, our new property management platform.

📱 Getting Started:
1. Click this link: https://capital-rooms.vercel.app/sign-up
2. Create your account
3. Add CROS to your home screen (looks like an app)

🔗 Quick Links:
- Admin: https://capital-rooms.vercel.app/admin
- Tenant: https://capital-rooms.vercel.app/tenant
- Lettings: https://capital-rooms.vercel.app/lettings

❓ Need help?
Contact support or reply to this email

Safe & Secure:
- Bank-grade encryption
- GDPR compliant
- Your data is private

Welcome aboard! 🏠

– Capital Rooms Team
```

---

## Troubleshooting Common Issues

### "App is slow for me"
```
Likely cause: User's internet, not app
Solution:
1. Check: https://capital-rooms.vercel.app/api/health
   (should return 200 OK < 100ms)
2. Ask user to refresh browser (hard refresh: Ctrl+Shift+R)
3. Ask if they're on slow WiFi
4. If still slow, check Vercel logs for errors
```

### "I can't add to home screen"
```
iPhone: Use Safari, not Chrome (Chrome PWA support limited)
Android: Use Chrome, should see install prompt

Fallback: Just use browser bookmark
```

### "Getting 500 errors"
```
Check:
1. Vercel status page: https://vercel.com/status
2. Supabase status: https://status.supabase.com
3. Check error logs: Vercel → Logs tab
4. Look for pattern: which pages? all users? specific time?
```

---

## Sign-Off Checklist

Before inviting 70+ users:

### Security (CRITICAL)
- [ ] All RLS policies tested and validated
- [ ] Input validation on all forms
- [ ] Rate limiting on SMS/email APIs
- [ ] Audit logging in place
- [ ] No sensitive data in error messages

### Performance (CRITICAL)
- [ ] Database indexes created
- [ ] Load test: 50 concurrent users pass
- [ ] Page load time < 2s average
- [ ] No N+1 queries in API endpoints

### Monitoring (HIGH)
- [ ] Error tracking set up (Sentry or Vercel Logs)
- [ ] Database alerts configured
- [ ] Team notified of alarms
- [ ] Incident response plan written

### Testing (HIGH)
- [ ] Multi-account testing (all 6 test scenarios) PASS
- [ ] Cross-browser testing (Chrome, Safari, Firefox)
- [ ] Mobile testing (iPhone, Android)
- [ ] Offline mode works

### Documentation (MEDIUM)
- [ ] Admin runbook: troubleshoot common issues
- [ ] User guide with screenshots
- [ ] Support email/phone configured
- [ ] FAQ document

---

## Scalability Path (If Growing Beyond 70)

```
70-100 users:     Current setup works (free tier)
100-500 users:    Upgrade Supabase to Pro ($25/mo)
500-2k users:     Upgrade Vercel to Pro ($20/mo) + optimize queries
2k+ users:        Consider: database replication, CDN upgrades
```

You won't hit scaling limits until 500+ users. Focus on stability first.

