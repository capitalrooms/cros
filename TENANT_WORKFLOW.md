# CROS Tenant Workflow Guide

## 👤 Tenant User Journey

### 1. **Tenant Login** → `/login`
```
Email: [tenant email - e.g., john@example.com]
Password: [their password]
```

**Note**: Tenant accounts need to be created in Supabase Auth first. Currently only harry@capitalrooms.co.uk is configured in Supabase Auth.

---

### 2. **Tenant Dashboard** → `/tenant`

Once logged in, tenant sees:
```
┌─────────────────────────────────────┐
│     Welcome, Tenant                 │
│     Logged in as: john@example.com  │
├─────────────────────────────────────┤
│                                     │
│  ☐ Report Maintenance               │
│    Submit a new maintenance request │
│    ► Go                             │
│                                     │
│  ☐ My Tickets                       │
│    Coming soon...                   │
│                                     │
│  ☐ House Notices                    │
│    Coming soon...                   │
│                                     │
│  ☐ Give Notice                      │
│    Coming soon...                   │
│                                     │
└─────────────────────────────────────┘
```

**Available Now**: Report Maintenance link

---

### 3. **Report Maintenance Issue** → `/tenant/maintenance`

Tenant fills out a structured form:

```
┌──────────────────────────────────────────────┐
│  Report Maintenance Issue                    │
├──────────────────────────────────────────────┤
│                                              │
│  Issue Title *                               │
│  [e.g., Leaky kitchen tap]                   │
│                                              │
│  Category *                                  │
│  [Dropdown: Plumbing, Electrical, Heating/  │
│   Cooling, Appliances, Paint/Walls,         │
│   Flooring, Windows/Doors, Other]           │
│                                              │
│  Description *                               │
│  [Textarea: Detailed explanation]            │
│                                              │
│  Priority *                                  │
│  ◯ Low  ◉ Medium  ◯ High                    │
│                                              │
│  [Submit Request] [Cancel]                   │
│                                              │
├──────────────────────────────────────────────┤
│  Frequently Asked Questions                  │
│                                              │
│  Q: How long does it take to respond?        │
│  A: 24-48 hours depending on priority       │
│                                              │
│  Q: Can I attach photos?                     │
│  A: Yes, after submitting initial report    │
│                                              │
│  Q: What if it's an emergency?               │
│  A: Set to High priority and call manager    │
│                                              │
└──────────────────────────────────────────────┘
```

**Form Fields**:
- **Issue Title**: Brief description (required)
- **Category**: Type of work (required, 8 options)
- **Description**: Detailed explanation (required)
- **Priority**: Low/Medium/High (required, default: Medium)

---

### 4. **Auto-Captured Information**

When tenant submits, the system **automatically captures**:
```javascript
{
  title: "Bathroom tap dripping constantly",
  description: "The tap drips even when fully closed. Going on for a week.",
  category: "Plumbing",
  priority: "high",
  
  // Auto-filled from tenant's account:
  reporter_id: "[tenant's user ID]",
  property_id: "[4 Willis Road, E153HH - where tenant lives]",
  room_id: "[Room 3 - tenant's assigned room]",
  status: "reported",
  
  created_at: "2026-08-04T14:32:00Z"
}
```

**Key Point**: The property and room are auto-linked! No tenant needs to enter address - system knows where they live.

---

### 5. **Submission Confirmation**

After clicking "Submit Request":

```
✅ Success Message:
"Maintenance request submitted successfully!"

[Auto-redirects to /tenant after 2 seconds]
```

---

## 🔄 What Happens Behind the Scenes

### Tenant Side:
```
Tenant Submits Form
      ↓
System validates all fields
      ↓
Creates ticket in maintenance_tickets table
      ↓
Auto-links to tenant's property & room
      ↓
Sets status: 'reported'
      ↓
Confirmation shown
      ↓
Tenant returns to dashboard
```

### Admin Side (Automatic):
```
New ticket appears in Admin Maintenance Dashboard
      ↓
Color-coded as 'reported' (blue)
      ↓
Admin can filter, view, and update status
      ↓
Status changes trigger notifications (v2 feature)
```

---

## 📊 Example Ticket Lifecycle

### 1. **Initial State** (Tenant submits)
```
Status: REPORTED (blue badge)
Priority: HIGH (red text)
Property: 4 Willis Road, E153HH
Room: 3
Tenant: john@example.com
```

### 2. **Admin Reviews** 
```
Admin clicks ticket
→ Views full details including description, category
→ Sees tenant info and property/room context
```

### 3. **Admin Assigns Contractor**
```
Status → ASSIGNED (purple badge)
Contractor: [Selected from contractors list]
```

### 4. **Contractor Accepts & Works**
```
Status → IN PROGRESS (yellow badge)
Contractor: Starts work
```

### 5. **Work Complete**
```
Status → COMPLETED (green badge)
Completion Date: [Auto-captured]
```

---

## 🏢 Property Context Flow

**The key insight**: Everything flows from property → room → tenant

```
Property: 4 Willis Road, E153HH
├── Room 1 [Tenant A]
├── Room 2 [Tenant B]
├── Room 3 [Tenant C] ← john@example.com
│   └── Maintenance Tickets:
│       └── Ticket #1: "Leaky tap" (REPORTED)
│       └── Ticket #2: "Broken window" (COMPLETED)
│       └── Ticket #3: "Paint peeling" (IN PROGRESS)
├── Room 4 [Empty]
└── Rooms 5-7 [Other tenants]
```

When admin views maintenance dashboard:
- **Sees**: All tickets across all properties
- **Can filter by**: Property, Status, Priority, Date
- **Context**: Always knows which property/room each ticket relates to
- **Notifications** (v2): Will start with property: "4 Willis Road: Room 3 needs attention"

---

## 🔧 Setting Up Test Tenants

To test the full flow, you need:

1. **Create tenant in Supabase Auth**:
   - Go to Supabase Dashboard → Authentication
   - Create new user: `test-tenant@example.com`
   - Set password: `TestPassword123!`

2. **Add to people table** (via Admin dashboard):
   - Email: `test-tenant@example.com`
   - Role: `tenant`
   - Property: `[property UUID]`
   - Room: `[room UUID]`

3. **Login as tenant**:
   - Navigate to `/login`
   - Enter `test-tenant@example.com` + password
   - Should redirect to `/tenant` dashboard

4. **Submit maintenance request**:
   - Click "Report Maintenance"
   - Fill out form
   - Submit
   - Ticket appears in Admin Dashboard immediately

---

## 📱 Current Features vs Future

### ✅ Current (v1 - Working)
- Tenant reports maintenance with structured form
- Auto-captures property/room context
- Admin sees all tickets in dashboard
- Filter and status management
- FAQ guidance on form

### ⏳ Next Phase (v2)
- Photo uploads for tickets
- Tenant can view their ticket status
- Real-time notifications
- Contractor communication/messaging
- Email alerts on status changes
- Timeline/history view

---

## 🎯 Key Design Points

1. **Property First**: 
   - Ticket is tied to property/room automatically
   - Admin notifications start with property context
   - No tenant ever needs to enter their address

2. **Simple for Tenants**:
   - Fill 4 fields + select priority
   - System handles rest
   - Built-in FAQ helps with common questions

3. **Powerful for Admin**:
   - See all tickets across all properties
   - Filter and drill down
   - Assign to contractors
   - Track status

4. **Contractor Integration**:
   - See assigned jobs
   - View property/room details
   - Accept/reject/complete work
   - Upload invoices/photos (v2)

---

## 🧪 Testing Workflow

```bash
1. Admin (harry@) adds test tenant via People Management
2. Supabase admin creates auth account for that tenant
3. Tenant logs in → sees dashboard
4. Tenant submits maintenance request
5. Admin logs in → sees ticket in dashboard
6. Admin updates status → Contractor sees job
7. Contractor accepts → Status changes
8. Contractor completes → Status changes again
```

---

## ✨ The Magic: Property-Centric Design

**Without this system**:
- Tenant: "I have a problem at home"
- Tries to describe their address
- Admin: "Which property is that again?"
- Confusion, delays, mistakes

**With CROS**:
- Tenant: Fills form (address auto-filled)
- Ticket created with: Property ✓ Room ✓ Tenant ✓
- Admin: Sees "4 Willis Road, Room 3 - Leaky tap"
- Contractor: Gets property address automatically
- Perfect context flow

---

This is why **properties are master data** with static info, and **tenants are dynamic assignments**. Each ticket flows through this hierarchy automatically.

