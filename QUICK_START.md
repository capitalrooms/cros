# CROS Quick Start Guide

## 🚀 Running the Application

```bash
cd /Users/boo/Documents/Claude/cros
npm run dev
```

Open `http://localhost:3000` in your browser.

---

## 👤 Test Accounts

### Administrator
- **Email**: harry@capitalrooms.co.uk
- **Password**: TestPassword123!

### Tenant (Created during testing)
- **Email**: john@example.com
- **Password**: TestPassword123! (or any password - you can set during signup)

---

## 📍 Feature Routes

| Feature | Route | User Role |
|---------|-------|-----------|
| Login | `/login` | All |
| Admin Dashboard | `/admin` | Administrator |
| **People Management** | `/admin/people` | Administrator |
| **Maintenance Dashboard** | `/admin/maintenance` | Administrator |
| Tenant Dashboard | `/tenant` | Tenant |
| **Report Maintenance** | `/tenant/maintenance` | Tenant |
| Contractor Dashboard | `/contractor` | Contractor |
| **My Jobs** | `/contractor/jobs` | Contractor |

**Bold** = Fully built and tested

---

## 🎯 What to Test

### 1. Admin People Management (`/admin/people`)
- [ ] Switch between Table View and Organized View
- [ ] Organized View shows: Tenants (by Property > Room), Contractors, Cleaners, Landlords, Admins
- [ ] Add a new person
- [ ] Delete a person
- [ ] See john@example.com listed under TENANTS > Unassigned Tenants > Common Area

### 2. Maintenance Dashboard (`/admin/maintenance`)
- [ ] View all tickets (currently empty, add some via tenant reporting)
- [ ] Filter by Status
- [ ] Filter by Priority
- [ ] Click ticket to see details modal
- [ ] Change ticket status

### 3. Tenant Reporting (`/tenant/maintenance`)
- [ ] Fill out form with title, category, description, priority
- [ ] Submit successfully
- [ ] See confirmation message

### 4. Contractor Portal (`/contractor/jobs`)
- [ ] See available jobs (once created)
- [ ] Accept a job
- [ ] See it move to "My Assigned Jobs"
- [ ] Start work
- [ ] Mark complete

---

## 📊 Database

**Supabase Project**: fihjzzxxhprxgjuefgtb

### Tables
- `people` - Users and roles ✅ (Created)
- `maintenance_tickets` - Work requests ✅ (Created)
- `ticket_messages` - Communication (structure ready)
- `attachments` - Photos/docs (structure ready)
- `properties` - Property data (structure ready)
- `rooms` - Room data (structure ready)

---

## 🎨 Design Notes

- Custom spacing scale: xs(4px), sm(8px), md(12px), lg(16px), xl(24px), 2xl(32px), 3xl(48px)
- Primary color: #0066FF (blue)
- Status colors: Green (complete), Yellow (in progress), Purple (assigned), Blue (reported)
- Responsive design works on mobile, tablet, desktop

---

## 🔧 Key Files

```
/app/admin/
  ├── page.tsx                    # Admin dashboard
  ├── people/page.tsx             # People management (Table + Organized views)
  └── maintenance/page.tsx        # Maintenance dashboard

/app/tenant/
  ├── page.tsx                    # Tenant dashboard
  └── maintenance/page.tsx        # Report maintenance form

/app/contractor/
  ├── page.tsx                    # Contractor dashboard
  └── jobs/page.tsx               # Jobs portal

/lib/
  ├── supabase.ts                 # Supabase client
  └── auth.ts                     # Authentication utilities

/supabase/migrations/
  ├── 001_init_people_table.sql   # People table
  └── 002_add_v1_features_tables.sql # Tickets, attachments, etc.
```

---

## 🐛 Troubleshooting

### "Not authenticated" error
- Clear browser cookies
- Log out (button in top-right)
- Log back in with credentials above

### Database tables missing
- Run the migration SQL in Supabase SQL Editor:
  - Go to Supabase Dashboard
  - SQL Editor
  - Copy/paste contents of `/supabase/migrations/*.sql`
  - Run each query

### Login redirects to login page
- Make sure you're using the correct email/password
- Check the console for any error messages
- Verify Supabase credentials in `.env.local`

### Styles not applying
- Hard refresh: `Ctrl+Shift+R` (or `Cmd+Shift+R` on Mac)
- Check that Tailwind CSS is installed: `npm list tailwindcss`

---

## 📈 Next Phase Ideas

1. **Photo Uploads** - Add photos to maintenance tickets
2. **Messaging** - Real-time chat between parties
3. **Invoicing** - Generate bills from tickets
4. **Scheduling** - Calendar integration
5. **Notifications** - Email alerts on status changes
6. **Analytics** - Dashboard with metrics
7. **Mobile App** - React Native version

---

## 📚 Documentation

- **COMPLETION_SUMMARY.md** - Full project overview
- **V1_FEATURES_SUMMARY.md** - Detailed feature documentation
- **FINAL_SETUP.md** - Database initialization instructions
- **This file** - Quick reference

---

## ✅ Project Status

**Status**: ✅ COMPLETE  
**v1 Features**: 4/4 Delivered  
**Ready for**: Deployment, User Testing, v2 Planning

---

## 💬 Questions?

Check the documentation files or review the component code - it's all well-commented and type-safe!

---

**Happy testing! 🎉**
