# Quick Start Checklist - Complete in 15 Minutes

## Step 1: Apply Migrations (5 min)

### Go to Supabase Dashboard
https://app.supabase.com → Select your project → SQL Editor

### Copy & Run These 4 SQL Files

**In order:**

- [ ] `supabase/migrations/014_add_cleaner_jobs.sql`
- [ ] `supabase/migrations/015_add_admin_appointments.sql`  
- [ ] `supabase/migrations/016_add_notifications.sql`
- [ ] `supabase/migrations/021_create_messages_table.sql`

**How:**
1. Open each file in your repo
2. Copy all SQL
3. Paste into Supabase SQL Editor
4. Click "Run"
5. Wait for success (should be instant)

## Step 2: Test Login (2 min)

### Option A: Quick Dev Login (Fastest)
```
Go to: http://192.168.1.125:3000/test-notifications
Should see notification demo
```

### Option B: Real Auth Login (Wait for Rate Limit)
```
Go to: http://192.168.1.125:3000/login
Email: cleaner+test@capitalrooms.co.uk
Password: TestCleaner123!
(May show rate limit error - that's normal)
```

## Step 3: Create Your First Job (2 min)

### Call Setup Endpoint
```bash
curl -X POST http://localhost:3000/api/admin/complete-workflow-setup \
  -H "Content-Type: application/json" \
  -d '{}'
```

Should return: `"workflow_ready": true`

## Step 4: Walk Through Workflow (5 min)

### 4a. As Cleaner
- Login as cleaner+test@capitalrooms.co.uk
- Accept cleaning job for 123 Test Street
- Mark as complete
- Add notes

### 4b. As Tenant  
- Login as tenant1+test@capitalrooms.co.uk
- See "Cleaning scheduled" notification
- See "Viewing scheduled" notification

### 4c. As Admin
- Login as admin+test@capitalrooms.co.uk
- Book a viewing
- (System should notify tenants)

## Success Criteria

✅ All 4 migrations applied without errors  
✅ Can view /test-notifications page  
✅ Can login (either dev-login or real auth)  
✅ Cleaning job appears in system  
✅ Tenants see notifications  
✅ Viewing books and cascades  

## Troubleshooting

| Issue | Solution |
|-------|----------|
| Migration fails | Check SQL syntax, run one at a time |
| Auth rate limit | Use dev-login instead or wait 2-4 hours |
| No notifications | Ensure migration 021 ran successfully |
| Can't find property | Check property ID: `11fe2107-b88d-4e64-b129-94a661933094` |

## Files to Reference

- Complete guide: `SETUP_STATUS_AND_NEXT_STEPS.md`
- Workflow summary: `WORKFLOW_SETUP_SUMMARY.md`
- Test page: `/test-notifications`
- API docs: Check individual route.ts files in `/app/api/`

---

**Expected time:** 15 minutes  
**Difficulty:** Easy (mostly copy/paste)  
**Help available:** Check SETUP_STATUS_AND_NEXT_STEPS.md for detailed explanations
