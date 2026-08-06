# 🔧 Contractor Visibility Fix – Diagnostic Guide

**Issue:** Contractor can't see tickets reported by tenant  
**Root Cause:** Jobs weren't released to contractors yet  
**Fix Applied:** Updated contractor dashboard to show released jobs

---

## 🔄 Job Lifecycle (How Admin Releases Jobs)

```
1. Tenant reports issue → Status: "reported" (in "Awaiting approval")
                          ↓
2. Admin APPROVES → Status: "reported", approved_at set (in "With contractors")
                          ↓
3. Admin ASSIGNS to contractor → contractor_id set, Status: "assigned" (in "Booked in")
```

**KEY:** Contractors can now see jobs in step 2 AND step 3

---

## ✅ What Contractor Will See Now

After fix, contractor dashboard shows:

### 1. **Jobs Assigned to Them** (contractor_id = their ID)
- These jobs: contractor_id is set, they're responsible
- Status: "assigned"
- Can update status, add notes, mark complete

### 2. **Available Jobs** (released but not yet assigned)
- These jobs: approved_at is set, contractor_id is NULL
- Released to contractors but waiting for one to claim them
- Can self-assign by starting to work on them

---

## 📋 How to Test This Fix

### Step 1: Admin Releases Jobs to Contractors
```
1. Go to /admin/maintenance
2. Find reported tickets in "Awaiting approval" column
3. Click ticket
4. Click "Approve & Release to Contractors"
   (This sets approved_at and moves to "With contractors")
✓ Ticket now visible to all contractors
```

### Step 2: Contractor Now Sees Them
```
1. Logout (admin)
2. Login as contractor (contractor@example.com / password)
3. Go to /contractor
4. Should see jobs in dashboard:
   - Jobs assigned to them (if contractor_id is set)
   - Jobs released to contractors (if approved_at is set)
```

### Step 3: Contractor Assigns to Self
```
1. In contractor dashboard, click unassigned job
2. Job detail page opens
3. Can add notes, update status
4. Should be able to mark as "In Progress"
✓ Job now tracked in contractor's dashboard
```

---

## 🔍 Verify Jobs Are Released

### In Admin Maintenance Page
Find each reported ticket and check status:

- **"Awaiting approval"** column = Job NOT yet released
  - Action: Click "Approve & Release" button
  - Result: Moves to "With contractors"

- **"With contractors"** column = Job IS released but unassigned
  - Action: Wait for contractor to see it OR click to assign
  - Result: Appears in contractor dashboard

- **"Booked in"** column = Job IS assigned
  - Action: None needed (contractor has it)
  - Result: Shows in contractor dashboard under assigned jobs

---

## 🐛 Troubleshooting

### Issue: Still can't see jobs as contractor
**Solution:**
1. Make sure jobs are in **"With contractors"** or **"Booked in"** columns
2. If in "Awaiting approval", admin needs to approve them first
3. Refresh contractor dashboard
4. Check browser console (F12) for errors

### Issue: Jobs show but can't update
**Solution:**
1. Make sure contractor is logged in as contractor@example.com
2. Click job to go to detail page
3. Try updating status there

### Issue: What if contractor isn't assigned?
**Solution:**
Jobs released to contractors can be self-assigned:
1. Contractor sees job in their dashboard
2. Clicks job
3. Updates status to "In Progress"
4. That action implicitly claims it

---

## 📊 Current Job States After Fix

| Status | In Column | Contractor Sees? | Contractor Can Claim? |
|--------|-----------|------------------|-----------------------|
| reported, not approved | Awaiting approval | ❌ No | ❌ No |
| reported, approved, no contractor | With contractors | ✅ YES | ✅ YES |
| assigned to contractor | Booked in | ✅ YES | N/A (already assigned) |
| in progress | In progress | ✅ YES | N/A (in work) |
| completed | Completed | ✅ YES (history) | N/A (done) |

---

## 🚀 Next Steps

1. **Admin:** Go to `/admin/maintenance`
2. **Find:** Any tickets in "Awaiting approval"
3. **Action:** Click "Approve & Release to Contractors"
4. **Result:** Moves to "With contractors"
5. **Contractor:** Refresh dashboard
6. **Verify:** Jobs now visible!

---

## 💡 Query Change Explanation

**Before:**
```typescript
.eq('contractor_id', (data.assignment as any).id)
```
Only showed jobs where contractor_id exactly matched their ID

**After:**
```typescript
.or(`contractor_id.eq.${contractorId},and(approved_at.not.is.null,contractor_id.is.null)`)
```
Shows jobs where EITHER:
- `contractor_id` matches (assigned to them), OR
- `approved_at` is set (released) AND `contractor_id` is NULL (not yet claimed)

---

## ✅ Testing Checklist

- [ ] Job is in "With contractors" column in admin
- [ ] Contractor logs in and goes to /contractor
- [ ] Job appears in contractor dashboard
- [ ] Contractor can click job
- [ ] Contractor can update status
- [ ] Contractor can add notes
- [ ] Status updates reflected in admin view

---

**Status: FIX APPLIED - Test Now!**

Go to /admin/maintenance, approve the jobs, then check contractor dashboard.
