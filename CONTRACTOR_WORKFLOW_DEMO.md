# 🔧 Contractor Workflow Demo - CROS v1

**Date**: 2026-08-04  
**Contractor**: contractor@example.com  
**Status**: Ready to Test

---

## 📱 Contractor Experience Flow

### Step 1: Contractor Opens App & Logs In

```
URL: http://localhost:3000/login
Email: contractor@example.com
Password: (Set by contractor or admin)
```

**Login Screen Shows:**
```
┌─────────────────────────────────────────┐
│        Capital Rooms                     │
│    Sign in to your account              │
│                                         │
│  Email: [contractor@example.com]        │
│  Password: [••••••••••••]              │
│  [Sign in] Button                       │
└─────────────────────────────────────────┘
```

**After Login** → Auto-redirects to `/contractor/jobs`

---

### Step 2: Contractor Dashboard - Jobs Overview

**URL**: `http://localhost:3000/contractor/jobs`

**Screen Layout**:

```
┌─────────────────────────────────────────────────────────────┐
│ My Jobs                          Back to Dashboard           │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│ ▶ MY ASSIGNED JOBS                                          │
│                                                              │
│ ┌────────────────────────────────────────────────────────┐  │
│ │ Burst Pipe in Kitchen - URGENT              ⭐ HIGH   │  │
│ │ Water spraying from the main kitchen pipe.           │  │
│ │ Status: IN PROGRESS                                  │  │
│ │ [Click to view details]                             │  │
│ └────────────────────────────────────────────────────────┘  │
│                                                              │
│ ▶ AVAILABLE JOBS                                            │
│                                                              │
│ ┌────────────────────────────────────────────────────────┐  │
│ │ Paint Scuff Marks on Hallway Wall   ✓ LOW PRIORITY   │  │
│ │ Several scuff marks near the stairs.                 │  │
│ │                                                       │  │
│ │                        [View & Accept]               │  │
│ └────────────────────────────────────────────────────────┘  │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

---

### Step 3a: HIGH PRIORITY JOB - "Burst Pipe in Kitchen"

**Status**: IN PROGRESS (already accepted and started)

**Job Details Modal**:

```
┌──────────────────────────────────────────────────────────────┐
│  Burst Pipe in Kitchen - URGENT                        [✕]   │
│  Reported 04/08/2026                                         │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│  Description:                                                │
│  Water spraying from the main kitchen pipe under the sink.  │
│  This is actively flooding the area. Immediate attention    │
│  required.                                                   │
│                                                              │
│  ┌────────────────────────────────────────────────────────┐ │
│  │ Category: Plumbing                                     │ │
│  │ Priority: 🔴 HIGH                                      │ │
│  │ Location: Kitchen                                      │ │
│  └────────────────────────────────────────────────────────┘ │
│                                                              │
│  📸 PHOTOS FROM TENANT:                                     │
│  ┌──────────────┬──────────────┬──────────────┐            │
│  │ 📷 Photo 1   │ 📷 Photo 2   │ 📷 Photo 3   │            │
│  │ Water pooling│ Close-up of  │ Full kitchen │            │
│  │ under sink   │ damaged pipe │ view        │            │
│  └──────────────┴──────────────┴──────────────┘            │
│                                                              │
│  Job Progress:                                              │
│  Status: 🟡 IN PROGRESS (Started)                          │
│                                                              │
│  ┌──────────────────┐          ┌──────────────────┐        │
│  │  Mark Complete   │          │     Close        │        │
│  └──────────────────┘          └──────────────────┘        │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

**What the Contractor Sees:**

| Element | What Shows | Purpose |
|---------|-----------|---------|
| **Title** | "Burst Pipe in Kitchen - URGENT" | Clear issue description |
| **Photos** | 3 images from tenant | Visual diagnostics before arrival |
| **Priority** | 🔴 **HIGH** (red badge) | Urgent work - schedule ASAP |
| **Description** | Full details + urgency note | Understand severity |
| **Location** | Kitchen | Know exactly where to go |
| **Status** | IN PROGRESS | Contractor already accepted & started |
| **Action Button** | "Mark Complete" | Mark done after finishing |

---

### Step 3b: LOW PRIORITY JOB - "Paint Scuff Marks"

**Status**: REPORTED (Available to accept)

**Job Card** (in Available Jobs section):

```
┌────────────────────────────────────────────────────────────┐
│ Paint Scuff Marks on Hallway Wall          ✓ LOW PRIORITY │
│ Several scuff marks and paint damage on the ground floor  │
│ hallway wall near the stairs.                             │
│                                                            │
│                        [View & Accept]                    │
└────────────────────────────────────────────────────────────┘
```

**Click "View & Accept"** → Modal Opens:

```
┌──────────────────────────────────────────────────────────────┐
│  Paint Scuff Marks on Hallway Wall                     [✕]   │
│  Reported 04/08/2026                                         │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│  Description:                                                │
│  There are several scuff marks and paint damage on the     │
│  ground floor hallway wall near the stairs. Would like     │
│  these touched up when possible.                            │
│                                                              │
│  ┌────────────────────────────────────────────────────────┐ │
│  │ Category: Decoration & Finishes                        │ │
│  │ Priority: 🟢 LOW                                       │ │
│  │ Location: Ground Floor Hallway                         │ │
│  └────────────────────────────────────────────────────────┘ │
│                                                              │
│  📸 PHOTOS FROM TENANT:                                     │
│  ┌──────────────┬──────────────┐                           │
│  │ 📷 Photo 1   │ 📷 Photo 2   │                           │
│  │ Wide view of │ Close-up of  │                           │
│  │ hallway      │ damage area  │                           │
│  └──────────────┴──────────────┘                           │
│                                                              │
│  ACCEPT THIS JOB:                                           │
│                                                              │
│  Proposed Completion Date (Optional):                       │
│  [date picker]                                              │
│                                                              │
│  Estimated Cost (Optional):                                 │
│  [£_____] (e.g., £45.00)                                    │
│                                                              │
│  Notes (Optional):                                          │
│  [Text area for contractor notes]                           │
│  "I can match the wall paint color if needed"              │
│                                                              │
│  ┌──────────────────┐          ┌──────────────────┐        │
│  │  Accept Job      │          │     Close        │        │
│  └──────────────────┘          └──────────────────┘        │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

---

## 🔔 How Contractor Notifies About Visit

### Step 4: Accepting a Job = Notifying Property

**Workflow**:

```
Contractor clicks "Accept Job"
         ↓
Contractor fills optional fields:
  • Proposed Completion Date  ← "I can come Tuesday 2pm"
  • Estimated Cost           ← "£45.00"
  • Notes                    ← "Will match paint color"
         ↓
Clicks "Accept Job" button
         ↓
Status changes: REPORTED → ASSIGNED
         ↓
✅ NOTIFICATION SENT (automatically):
   - Property manager alerted
   - Job is now in contractor's queue
   - Contractor can see it in "My Assigned Jobs"
```

**What Property Manager Receives**:

The admin dashboard automatically updates:
- Kitchen Pipe job now shows: "Contractor assigned"
- Paint job now shows: "Contractor assigned - Visit scheduled for Tuesday"

---

## 📋 Contractor's Job Workflow

### Job Lifecycle:

```
1️⃣  REPORTED (Available to Accept)
    ├─ Contractor sees in "Available Jobs" (blue card)
    ├─ Can view photos & description
    └─ Clicks "View & Accept"

2️⃣  ASSIGNED (Contractor Accepted)
    ├─ Appears in "My Assigned Jobs"
    ├─ Shows proposed date & cost
    ├─ Status badge shows "Assigned"
    └─ Contractor clicks "Start Work"

3️⃣  IN PROGRESS (Work Started)
    ├─ Contractor has notified they're working
    ├─ Status badge shows "In Progress" (yellow)
    ├─ Contractor on-site or confirmed starting
    └─ Contractor clicks "Mark Complete"

4️⃣  COMPLETED (Work Done)
    ├─ Contractor submitted completion
    ├─ Job moved to history
    ├─ Admin sees job as done
    └─ Property gets closure notification
```

---

## 💬 Notification System Flow

### When Contractor Accepts a Job:

**Automatic Notifications Include**:

```
FOR ADMIN:
┌──────────────────────────────────────────────┐
│ ✅ Job Accepted                              │
│                                              │
│ Contractor accepted: Paint Scuff Marks      │
│ Proposed date: Tuesday 2pm                  │
│ Estimated cost: £45.00                      │
│ Notes: Will match paint color               │
│                                              │
│ Ticket Status: ASSIGNED                     │
└──────────────────────────────────────────────┘

FOR PROPERTY MANAGER:
┌──────────────────────────────────────────────┐
│ 🔧 Maintenance Scheduled                    │
│                                              │
│ Issue: Paint Scuff Marks on Hallway         │
│ Contractor: Will visit Tuesday at 2pm       │
│ Estimated cost: £45.00                      │
│                                              │
│ Please ensure hallway is accessible         │
└──────────────────────────────────────────────┘
```

### When Contractor Starts Work:

```
Status changes from "Assigned" → "In Progress"

Admin sees: Contractor actively working
Property sees: Work in progress, will be done soon
```

### When Contractor Marks Complete:

```
Status changes from "In Progress" → "Completed"

Admin sees: ✅ Job finished
Property gets notification: Issue resolved
Tenant satisfaction survey (future phase)
```

---

## 🎯 Key Features for Contractor

| Feature | What It Does | Example |
|---------|-------------|---------|
| **Priority Color** | Quick assessment of urgency | 🔴 HIGH = Emergency plumbing |
| **Photos** | Visual diagnostics | Tenant photos show water damage |
| **Location** | Know exactly where | "Ground Floor Hallway" |
| **Notes Field** | Communicate with admin | "Need paint matching kit" |
| **Proposed Date** | Tell property when you'll visit | "Tuesday 2pm" |
| **Estimated Cost** | Give price upfront | "£45.00" transparent pricing |
| **Status Tracking** | Know job status | Available → Assigned → Done |

---

## 📊 Contractor Dashboard Metrics

**What They Can See**:

```
My Assigned Jobs: 1
  - 1 In Progress (High Priority)
  
Available Jobs: 1
  - 1 Low Priority (Decoration)
  
Completed This Week: 3
  
Average Response Time: 2 hours
```

---

## 🚀 Notification Timing

| Event | Who Gets Notified | When | How |
|-------|------------------|------|-----|
| Job Assigned | Admin | Immediately | Dashboard update |
| Proposed Date Set | Property | With assignment | Email + in-app |
| Work Started | Admin | On button click | Status change |
| Work Complete | Admin & Property | On button click | Dashboard + notification |

---

## 💡 Example Scenario

### Scenario: Emergency Plumbing Burst

**Friday 10:00 AM - Tenant Reports Issue**
```
Tenant reports burst pipe
Photos show water spraying
Priority: HIGH
Location: Kitchen
```

**Friday 10:15 AM - Contractor Opens App**
```
✅ Logs in as contractor@example.com
✅ Goes to /contractor/jobs
✅ Sees HIGH priority "Burst Pipe" in Available Jobs
✅ Clicks "View & Accept"
```

**Friday 10:20 AM - Contractor Accepts**
```
✅ Accepts job immediately (emergency!)
✅ Notes: "Coming now - 10 minute ETA"
✅ Clicks "Accept Job"
```

**Friday 10:25 AM - Property Notified**
```
✅ Admin dashboard shows: "Contractor assigned"
✅ Property manager sees: "Contractor arriving in 5 mins"
✅ Auto-notification sent to property
```

**Friday 10:30 AM - Contractor Arrives**
```
✅ Contractor clicks "Start Work"
✅ Status: IN PROGRESS
✅ Takes action photos (repair in progress)
```

**Friday 11:15 AM - Work Complete**
```
✅ Contractor clicks "Mark Complete"
✅ Status: COMPLETED
✅ Property gets notification: "Issue resolved"
✅ Admin closes ticket
```

---

## 🎨 UI Color System for Contractor

```
Priority Indicators:
🔴 HIGH    (Red) - Urgent, same day
🟡 MEDIUM  (Yellow) - This week
🟢 LOW     (Green) - Schedule flexibly

Status Indicators:
🔵 REPORTED (Blue) - New, available to accept
🟣 ASSIGNED (Purple) - Contractor accepted
🟡 IN_PROGRESS (Yellow) - Work in progress
🟢 COMPLETED (Green) - All done
⚪ CANCELLED (Gray) - Cancelled

Action Buttons:
🔵 View & Accept (Blue) - Available jobs
🟡 Start Work (Yellow) - Ready to begin
🟢 Mark Complete (Green) - Finish job
```

---

## ✨ What Makes This Great

✅ **Simple Acceptance** - One click to accept job  
✅ **Visual Diagnostics** - See photos before arriving  
✅ **Cost Transparency** - Quote prices upfront  
✅ **Schedule Planning** - Set proposed dates  
✅ **Auto-Notification** - Property gets alert automatically  
✅ **Status Tracking** - Always know where job stands  
✅ **Priority Clear** - Red flags for emergencies  

---

## 🧪 Testing the Contractor Experience

### To Set Up Test Data:

1. **Admin logged in**
2. **People Management** → Add contractor@example.com (Done ✅)
3. **Create test maintenance tickets**:
   - HIGH priority: Plumbing issue
   - LOW priority: Decoration issue
4. **Contractor logs in** as contractor@example.com
5. **Contractor workflow**:
   - See Available Jobs
   - Accept high priority (notify with ETA)
   - Accept low priority (schedule for later)
   - Start work on high priority
   - Complete both jobs
   - See them in completed history

---

## 🔗 URLs for Contractor Testing

| Page | URL | Purpose |
|------|-----|---------|
| Login | `/login` | Sign in as contractor@example.com |
| Jobs Dashboard | `/contractor/jobs` | View assigned & available jobs |
| Accept Job | Modal on jobs page | Accept and schedule visit |
| Start Work | Modal action | Notify work in progress |
| Complete | Modal action | Mark job finished |

---

**Contractor experience is fully functional and ready to test!** 🚀

The workflow is intuitive and keeps the property informed at every step of the maintenance process.
