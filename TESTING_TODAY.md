# 🧪 Capital Rooms CROS – Testing Today

**Date: August 6, 2026**  
**Status: Login fixed, ready for comprehensive testing**

---

## ✅ Login Credentials (Verified)

### Admin Account
```
Email: harry@capitalrooms.co.uk
Password: TestPassword123!
Expected redirect: /admin
```

### Tenant Account
```
Email: itsharryb@protonmail.com
Password: password
Expected redirect: /tenant
```

### Contractor Account
```
Email: contractor@example.com
Password: password
Expected redirect: /contractor
```

---

## 🔧 What Was Fixed This Morning

**Login Page Issue:**
- ❌ Login page was expecting wrong response format from auth library
- ✅ **FIXED:** Updated login to properly handle `signIn` response
- ✅ Now correctly extracts user role and redirects to appropriate dashboard

---

## 📋 Testing Sequence

### Phase 1: Login & Navigation (5 min)

**1. Admin Login**
```
1. Go to http://192.168.1.125:3002/login
2. Enter: harry@capitalrooms.co.uk / TestPassword123!
3. Click "Sign in"
✓ Should redirect to /admin
✓ Should show admin dashboard with menu
```

**2. Check Admin Menu**
```
Should see:
  ✓ System Overview
  ✓ Availability
  ✓ Properties & Rooms
  ✓ Tenancies
  ✓ Property Notes
  ✓ All Maintenance
  ✓ Compliance
  ✓ Contacts
  ✓ Landlords
```

**3. Tenant Login**
```
1. Logout (button in top right)
2. Go to /login
3. Enter: itsharryb@protonmail.com / password
4. Click "Sign in"
✓ Should redirect to /tenant
✓ Should show tenant dashboard
```

**4. Contractor Login**
```
1. Logout
2. Go to /login
3. Enter: contractor@example.com / password
4. Click "Sign in"
✓ Should redirect to /contractor
✓ Should show contractor dashboard
```

### Phase 2: Property Setup (10 min)

**Login as Admin → Go to /admin/properties**

**Create a Property:**
```
1. Click "+ Property" button
2. Fill in:
   - Name: "Test House"
   - Address: "123 Test Street, London"
   - Bedrooms: 3
   - Bathrooms: 2
3. Click "Add property"
✓ Should show success alert
✓ Property should appear in list
```

**Add Rooms:**
```
1. Click newly created property
2. Click "Add room"
3. Fill in:
   - Room name: "Room 1"
   - Status: "available"
4. Click "Add room"
✓ Room should appear instantly
✓ Repeat for 2-3 rooms
```

### Phase 3: Tenancy Creation (10 min)

**Go to /admin/tenancies**

**Create First Tenant (All opt-ins):**
```
1. Click "Create Tenancy"
2. Select Property: "Test House"
3. Select Room: "Room 1"
4. Tenant Info:
   - Full Name: "Harry Brown"
   - Email: itsharryb@protonmail.com
   - Phone: 07700000000
5. Communication Preference: Email
6. Status: Active
7. Start Date: Pick today
8. Rent Amount: 150
9. Check ALL opt-in boxes:
   ☑ Maintenance updates
   ☑ Viewing notifications
   ☑ Appointment reminders
   ☑ Cleaning updates
10. Click "Create Tenancy"
✓ Should show success alert
✓ Tenancy should appear in list
```

### Phase 4: Property Notes (5 min)

**Go to /admin/property-notes**

**Post Admin Note:**
```
1. Select property: "Test House"
2. Title: "Welcome to the property"
3. Message: "This is a beautiful home. Please keep the common areas tidy."
4. Click "Post Update"
✓ Should show success alert
✓ Note should appear in "Recent Notes" sidebar
✓ Note should have ⚙️ icon (admin update)
```

### Phase 5: Tenant Dashboard (5 min)

**Login as Tenant (itsharryb@protonmail.com)**

**Go to /tenant**

```
✓ Should show property name: "Test House"
✓ Should show address
✓ Should show rent amount: £150
✓ Should show "Property notes" section
✓ Should see admin note with:
  - ⚙️ Admin Update label
  - Title: "Welcome to the property"
  - Your message
  - Creator name + timestamp
```

### Phase 6: Compliance Tracking (5 min)

**Login as Admin → Go to /admin/compliance**

```
✓ Should show "Test House" in property list
✓ Should show status: Green or Red (depends if certs entered)
✓ Should show fields for:
  - Gas Safety
  - EICR (Electrical)
  - Fire Detection
  - Emergency Lighting
  - PAT Testing
```

### Phase 7: System Overview (2 min)

**Go to /admin/overview**

```
✓ Should show KPI cards:
  - Total Properties (should be 1+)
  - Total Rooms (should be 3+)
  - Total Tenancies (should be 1+)
  - Total Users
✓ Should show occupancy stats
✓ Should show platform health (all green)
```

---

## 🐛 Troubleshooting

### Issue: Can't log in
**Solution:**
1. Check email matches exactly (case-sensitive in some cases)
2. Check password is correct (copy/paste to avoid typos)
3. Check internet connection
4. Try clearing browser cache
5. Check Supabase is running

### Issue: Logged in but page is blank
**Solution:**
1. Refresh the page (Ctrl+R or Cmd+R)
2. Check browser console for errors (F12)
3. Check network tab to see if API calls are failing

### Issue: Admin note not showing on tenant dashboard
**Solution:**
1. Make sure you posted the note (check alert message)
2. Refresh tenant dashboard
3. Check that you're logged in as the tenant assigned to that room

### Issue: Can't create property
**Solution:**
1. Make sure all fields are filled (name, address required)
2. Check for red error messages below fields
3. Check browser console for network errors

---

## ✅ Complete Testing Checklist

### Authentication
- [ ] Admin can log in
- [ ] Tenant can log in
- [ ] Contractor can log in
- [ ] Logout works on all pages
- [ ] Wrong password shows error

### Admin Dashboard
- [ ] All menu items visible
- [ ] Navigation between sections works
- [ ] System overview shows correct counts

### Property Management
- [ ] Can create property
- [ ] Can add rooms to property
- [ ] Room list shows in property details
- [ ] Room status dropdown works

### Tenancy Management
- [ ] Can create tenancy
- [ ] Can select property and room
- [ ] Tenant info fields work
- [ ] Communication preference selector works
- [ ] All 4 opt-in checkboxes work
- [ ] Tenancy appears in list

### Property Notes
- [ ] Can post note to property
- [ ] Note appears in sidebar
- [ ] Note appears on tenant dashboard
- [ ] Admin note has ⚙️ icon
- [ ] Creator name shows correctly
- [ ] Timestamp shows correctly

### Tenant Dashboard
- [ ] Shows property info
- [ ] Shows rent amount
- [ ] Shows move-in date
- [ ] Shows property notes section
- [ ] Shows notes with correct icons
- [ ] Responsive on mobile

### Compliance
- [ ] All properties listed
- [ ] Status badges show (Green/Yellow/Red)
- [ ] Cert date fields visible
- [ ] Can update cert dates

### Overall System
- [ ] Premium design throughout
- [ ] Consistent AppBar on all pages
- [ ] Form validation works
- [ ] Error messages clear and helpful
- [ ] Success alerts appear
- [ ] Responsive on different screen sizes

---

## 📊 Quick Status Check

After testing, you should have:
- ✅ 1 property created
- ✅ 3 rooms added
- ✅ 1 tenancy created
- ✅ 1 property note posted
- ✅ All 3 user roles tested
- ✅ All major workflows verified

---

## 🚀 Next Steps After Testing

1. **If login works:**
   - Test all workflows from Phase 1-7
   - Gather feedback on design/UX
   - Note any bugs or missing features

2. **If you find issues:**
   - Document the issue (exact steps)
   - Check browser console (F12) for errors
   - Check network tab for failed API calls
   - Get error messages and report them

3. **For deployment:**
   - Fix any critical bugs
   - Run through testing checklist again
   - Prepare production environment
   - Plan rollout

---

## 💬 Feedback Areas

As you test, note your impressions on:
- **Design** – Does it feel premium?
- **UX** – Are workflows intuitive?
- **Performance** – Are pages loading fast?
- **Clarity** – Are buttons and labels clear?
- **Mobile** – Responsive on phone/tablet?
- **Errors** – Are error messages helpful?

---

## 📞 If You Get Stuck

**Most Common Issues:**
1. **"This email is not recognized"** → Email not in `people` table (contact admin to add)
2. **Page won't load** → Check browser console for errors
3. **Note doesn't show** → Refresh page, check you posted to correct property
4. **Can't create tenancy** → Missing required fields (fill all fields in form)

---

**Ready to test! 🚀 Start with admin login and work through Phase 1.**

Let me know:
- ✅ If login works
- ❌ What errors you see
- 🐛 Any other issues
- 💭 Overall feedback on the system
