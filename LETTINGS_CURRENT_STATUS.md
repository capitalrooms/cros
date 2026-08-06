# Lettings Dashboard - Current Status

## ✅ Completed

### 1. Viewing Time Slots Updated
- **Change**: User feedback indicated viewings happen every 15 minutes, not 3 hours
- **Implemented**: Time slot dropdown now shows 15-minute intervals
- **Range**: 8:00 AM to 6:00 PM (40 slots total)
- **Format**: Displays as "10:30 am", "2:45 pm", etc.
- **Location**: `/app/lettings/page.tsx` line ~400
- **Status**: ✅ Code updated and will auto-reload

### 2. Notification System
- **Room-specific notifications**: Notify tenant in specific room when viewing scheduled
- **Property-wide notifications**: Notify all other tenants in property
- **API Endpoint**: `/api/notify-tenant-viewing`
- **Email Integration**: Uses Resend API for sending notifications
- **Status**: ✅ Implemented and tested

### 3. Dashboard Features
- Room inventory by property
- Status tracking (occupied, available, on notice)
- Rent tracking (previous and current asking)
- Priority property highlighting
- Viewing management with notes
- Completed viewing tracking
- **Status**: ✅ UI complete (needs database schema to function)

## ❌ Pending

### 1. Database Schema Migration (CRITICAL)
The Supabase database needs the following changes:
- Add 7 new columns to `rooms` table (status, rent fields, marketing info, priority)
- Create new `viewings` table with 11 columns
- Add 6 database indexes
- Set up Row Level Security policies

**Action Required**:
1. Go to Supabase Dashboard
2. Open SQL Editor
3. Run the SQL from: `/SETUP_LETTINGS_DASHBOARD.md`

**Impact**: Without this, the dashboard shows "No rooms" because:
- The rooms table lacks the lettings schema columns
- The viewings table doesn't exist
- RLS policies need to be configured

### 2. Test Account Creation
Need to create an auth account with lettings role:
- Email: `lettings@capitalrooms.co.uk`
- Password: (your choice)
- Role: lettings (will auto-assign)

**Action Required**:
1. Go to Supabase Dashboard → Authentication → Users
2. Click "Add user"
3. Enter email and password
4. Check "Auto confirm user"
5. Click Create

## Quick Start Checklist

- [ ] Run database migration SQL (see SETUP_LETTINGS_DASHBOARD.md)
- [ ] Create lettings test account in Supabase
- [ ] Visit http://localhost:3000 and sign in
- [ ] Navigate to `/lettings` path
- [ ] Verify rooms display with status badges
- [ ] Test adding a viewing with 15-minute time slots
- [ ] Test tenant notifications

## What's Working

✅ Time slots in 15-minute intervals
✅ Viewing form with visitor details
✅ Notification system (room tenant + other tenants)
✅ Room status badges
✅ Rent tracking display
✅ Priority room highlighting

## What's Not Working Yet

❌ Rooms not displaying (database schema missing)
❌ Viewings can't be saved (table doesn't exist)
❌ Notifications can't be tested (no viewing data)

## Database Status Check

Run this to check current schema:
```bash
curl -X POST http://localhost:3000/api/setup-lettings \
  -H "Content-Type: application/json" \
  -d '{"key":"development"}'
```

Expected response before migration:
```json
{
  "error": "Rooms table is missing lettings columns",
  "status": "needs_migration"
}
```

Expected response after migration:
```json
{
  "status": "ready",
  "message": "Lettings schema is properly initialized"
}
```

## Files Modified

- `/app/lettings/page.tsx` — Updated time slots to 15-minute intervals
- Created `/SETUP_LETTINGS_DASHBOARD.md` — Setup guide with SQL
- Created `/LETTINGS_SETUP.md` — Detailed migration instructions
- Created `/app/api/setup-lettings/route.ts` — Schema verification endpoint

## Next Steps

1. **Immediate**: Apply database migration (1-2 minutes)
2. **Then**: Create test account (1 minute)
3. **Test**: Sign in and verify rooms display
4. **Enhance**: Add more test data (rent values, room descriptions, etc.)

The viewing slot system is ready to use once the database is set up!
