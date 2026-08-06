# 📊 Admin Maintenance Dashboard - Visual Guide

**Purpose**: View all maintenance tickets, filter by status/priority, assign contractors, track progress

---

## 🎯 Dashboard Overview

**URL**: `http://localhost:3000/admin/maintenance`

### Dashboard Layout:

```
┌─────────────────────────────────────────────────────────────────┐
│ Maintenance Dashboard                    Back to Dashboard      │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│ FILTERS:                                                        │
│ Status: [All ▼]  [Reported] [Assigned] [In Progress] [Done]   │
│ Priority: [All ▼] [High] [Medium] [Low]                       │
│                                                                 │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│ ALL TICKETS (5)                                                 │
│                                                                 │
│ ┌─────────────────────────────────────────────────────────────┐│
│ │ 🔴 Burst Pipe in Kitchen - URGENT                   HIGH   ││
│ │ Reported: 04/08/2026 | Status: IN PROGRESS        2 days  ││
│ │ Property: Test Property - Demo | Location: Kitchen        ││
│ │ Reporter: john@example.com | Contractor: contractor@ex... ││
│ │                                                             ││
│ │ [Click for details]                                        ││
│ └─────────────────────────────────────────────────────────────┘│
│                                                                 │
│ ┌─────────────────────────────────────────────────────────────┐│
│ │ 🟢 Paint Scuff Marks on Hallway Wall                LOW    ││
│ │ Reported: 04/08/2026 | Status: ASSIGNED          1 day   ││
│ │ Property: Test Property - Demo | Location: Ground Hallway ││
│ │ Reporter: john@example.com | Contractor: contractor@ex... ││
│ │                                                             ││
│ │ [Click for details]                                        ││
│ └─────────────────────────────────────────────────────────────┘│
│                                                                 │
│ ┌─────────────────────────────────────────────────────────────┐│
│ │ (More tickets...)                                           ││
│ └─────────────────────────────────────────────────────────────┘│
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## 🎨 Ticket Card Details

### HIGH Priority Ticket Example:

```
┌──────────────────────────────────────────────────────────────────┐
│ 🔴 Burst Pipe in Kitchen - URGENT                        HIGH    │
│                                                                  │
│ Timeline:                                                        │
│ • Reported: Friday 10:00 AM (04/08/2026)                        │
│ • Status: IN PROGRESS                                           │
│ • Age: 2 days old                                               │
│                                                                  │
│ Location Details:                                               │
│ • Property: Test Property - Demo (123 Test Street, London)     │
│ • Room Location: Kitchen (Communal)                            │
│                                                                  │
│ Reported By:                                                    │
│ • Tenant: john@example.com                                      │
│ • Reported 2 days ago                                           │
│                                                                  │
│ Issue Description:                                              │
│ "Water spraying from the main kitchen pipe under the sink.     │
│  This is actively flooding the area. Immediate attention       │
│  required."                                                     │
│                                                                  │
│ Assigned Contractor:                                            │
│ • contractor@example.com                                        │
│ • Accepted with proposed completion: This week                 │
│ • ETA: Friday 10:30 AM (Contractor is on-site)                │
│                                                                  │
│ Photos from Tenant:                                            │
│ ┌──────────────┬──────────────┬──────────────┐               │
│ │ 📷 Photo 1   │ 📷 Photo 2   │ 📷 Photo 3   │               │
│ │ (thumbnail)  │ (thumbnail)  │ (thumbnail)  │               │
│ └──────────────┴──────────────┴──────────────┘               │
│ (Click any to enlarge)                                         │
│                                                                  │
│ Current Status:                                                 │
│ [REPORTED] → [ASSIGNED] → [IN PROGRESS] ✓ → [COMPLETED]      │
│                                                                  │
│ [View Full Details]  [Update Status]                          │
└──────────────────────────────────────────────────────────────────┘
```

### LOW Priority Ticket Example:

```
┌──────────────────────────────────────────────────────────────────┐
│ 🟢 Paint Scuff Marks on Hallway Wall                      LOW    │
│                                                                  │
│ Timeline:                                                        │
│ • Reported: Friday 10:05 AM (04/08/2026)                        │
│ • Status: ASSIGNED                                              │
│ • Age: 1 day old                                                │
│                                                                  │
│ Location Details:                                               │
│ • Property: Test Property - Demo (123 Test Street, London)     │
│ • Room Location: Ground Floor Hallway (Communal)              │
│                                                                  │
│ Reported By:                                                    │
│ • Tenant: john@example.com                                      │
│ • Reported 1 day ago                                            │
│                                                                  │
│ Issue Description:                                              │
│ "There are several scuff marks and paint damage on the ground  │
│  floor hallway wall near the stairs. Would like these touched  │
│  up when possible."                                             │
│                                                                  │
│ Assigned Contractor:                                            │
│ • contractor@example.com                                        │
│ • Accepted with proposed completion: Tuesday 2pm              │
│ • Estimated cost: £45.00                                        │
│ • Notes: "Will match paint color"                              │
│                                                                  │
│ Photos from Tenant:                                            │
│ ┌──────────────┬──────────────┐                               │
│ │ 📷 Photo 1   │ 📷 Photo 2   │                               │
│ │ (thumbnail)  │ (thumbnail)  │                               │
│ └──────────────┴──────────────┘                               │
│                                                                  │
│ Current Status:                                                 │
│ [REPORTED] → [ASSIGNED] ✓ → [IN PROGRESS] → [COMPLETED]      │
│                                                                  │
│ [View Full Details]  [Update Status]  [Change Contractor]     │
└──────────────────────────────────────────────────────────────────┘
```

---

## 🔍 Detailed View Modal

**Click "View Full Details"** to open expanded view:

```
┌──────────────────────────────────────────────────────────────────┐
│ MAINTENANCE TICKET DETAILS                                 [✕]   │
├──────────────────────────────────────────────────────────────────┤
│                                                                  │
│ TICKET INFORMATION                                              │
│ ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━│
│                                                                  │
│ Ticket #: TKT-001                                               │
│ Title: Burst Pipe in Kitchen - URGENT                          │
│ Category: Plumbing                                              │
│ Priority: 🔴 HIGH                                              │
│ Status: 🟡 IN PROGRESS                                         │
│ Created: 04/08/2026 10:00 AM                                    │
│ Last Updated: 04/08/2026 10:30 AM (2 hours ago)               │
│                                                                  │
│ PROPERTY & LOCATION                                             │
│ ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━│
│                                                                  │
│ Property: Test Property - Demo                                  │
│ Address: 123 Test Street, London                                │
│ Location in Property: Kitchen (Communal Area)                   │
│ Room: N/A (Communal, not tied to specific room)                │
│                                                                  │
│ REPORTER                                                        │
│ ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━│
│                                                                  │
│ Tenant: john@example.com                                        │
│ Reported: 04/08/2026 10:00 AM                                   │
│                                                                  │
│ ISSUE DESCRIPTION                                               │
│ ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━│
│                                                                  │
│ "Water spraying from the main kitchen pipe under the sink.     │
│  This is actively flooding the area. Immediate attention       │
│  required."                                                     │
│                                                                  │
│ CONTRACTOR ASSIGNMENT                                           │
│ ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━│
│                                                                  │
│ Assigned To: contractor@example.com                             │
│ Accepted: Yes (Friday 10:15 AM)                                 │
│ Proposed Completion: This week                                  │
│ Estimated Cost: N/A (Emergency, to be determined)              │
│ Contractor Notes: "Coming now - 10 minute ETA"                 │
│                                                                  │
│ PHOTOS & DIAGNOSTICS                                            │
│ ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━│
│                                                                  │
│ Photo 1: Water pooling under sink (taken 10:02 AM)            │
│ ┌──────────────────────────────────────┐                      │
│ │  [Full size image displayed]         │                      │
│ │  Shows water actively spraying       │                      │
│ │  Caption: "Water damage area"        │                      │
│ └──────────────────────────────────────┘                      │
│                                                                  │
│ Photo 2: Close-up of pipe damage (taken 10:03 AM)             │
│ ┌──────────────────────────────────────┐                      │
│ │  [Full size image displayed]         │                      │
│ │  Shows burst in main pipe            │                      │
│ └──────────────────────────────────────┘                      │
│                                                                  │
│ Photo 3: Kitchen overview (taken 10:04 AM)                     │
│ ┌──────────────────────────────────────┐                      │
│ │  [Full size image displayed]         │                      │
│ │  Shows flooded kitchen area          │                      │
│ └──────────────────────────────────────┘                      │
│                                                                  │
│ WORKFLOW & TIMELINE                                             │
│ ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━│
│                                                                  │
│ 10:00 AM - ✅ Reported by john@example.com                     │
│ 10:15 AM - ✅ Accepted by contractor@example.com              │
│ 10:30 AM - ✅ Work started (In Progress)                       │
│ [Waiting] - ⏳ Completion (Expected this week)                 │
│                                                                  │
│ STATUS UPDATE OPTIONS                                           │
│ ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━│
│                                                                  │
│ Current Status: IN PROGRESS                                     │
│                                                                  │
│ Change to: [Completed ▼] [Cancelled ▼]                        │
│                                                                  │
│ Or keep as: [IN PROGRESS] ✓                                    │
│                                                                  │
│ Actions:                                                        │
│ [✏ Add Note]  [📱 Contact Contractor]  [📧 Notify Tenant]   │
│                                                                  │
│ [Save Changes] [Close]                                          │
│                                                                  │
└──────────────────────────────────────────────────────────────────┘
```

---

## 📊 Dashboard Filters

### Filter By Status:

```
[All] [Reported] [Assigned] [In Progress] [Completed] [Cancelled]

Reported     = New tickets, not yet assigned
Assigned     = Contractor accepted, not started
In Progress  = Actively being worked on
Completed    = Finished, waiting for closure
Cancelled    = Cancelled jobs
```

### Filter By Priority:

```
[All] [🔴 High] [🟡 Medium] [🟢 Low]

High    = Emergency, same-day response needed
Medium  = This week/important
Low     = When possible, no rush
```

### Combined Filters Example:

```
Status: [Assigned] + Priority: [High]
Result: Shows all high-priority jobs assigned to contractors
        that haven't been started yet
        
Status: [In Progress] + Priority: [All]
Result: Shows all jobs currently being worked on
        regardless of priority
```

---

## 🎯 Admin Key Actions

### From Dashboard View:

1. **View Ticket**: Click on any ticket card → Full details modal
2. **Filter Tickets**: Use dropdown filters
3. **Update Status**: Click ticket → Change status dropdown
4. **Contact Contractor**: Click ticket → "Contact Contractor" button
5. **Notify Tenant**: Click ticket → "Notify Tenant" button
6. **Add Notes**: Click ticket → "Add Note" section

### Common Workflows:

**Emergency Plumbing**:
```
1. See HIGH priority ticket
2. Click to view (see photos)
3. Confirm contractor assigned
4. Monitor status closely
5. Update to COMPLETED when contractor marks done
```

**Routine Maintenance**:
```
1. See LOW priority ticket
2. Filter to find best contractor
3. Assign contractor (if not yet assigned)
4. Let contractor schedule at their convenience
5. Check in after completion
```

**Problem Resolution**:
```
1. See ticket with no contractor
2. Click and review details + photos
3. Find suitable contractor from list
4. Assign and note required deadline
5. Follow up on progress
```

---

## 📈 Dashboard Metrics (Admin View)

```
📊 DASHBOARD STATISTICS:

Total Tickets: 47
├─ Reported (New): 5
├─ Assigned (Pending): 8
├─ In Progress: 3
└─ Completed: 31

By Priority:
├─ 🔴 High: 2 (both in progress)
├─ 🟡 Medium: 8
└─ 🟢 Low: 37

Average Time to Accept: 2.3 hours
Average Time to Complete: 1.8 days
Customer Satisfaction: 4.7/5 stars

This Week's Activity:
├─ New Reports: 12
├─ Completed: 9
└─ Open: 5
```

---

## 🔔 Real-Time Updates

**Admin Dashboard Updates When:**

✅ Tenant submits new issue  
✅ Contractor accepts job  
✅ Contractor marks work as in progress  
✅ Contractor completes work  
✅ Photos/videos uploaded  
✅ Status changed  

The list refreshes automatically without needing to reload.

---

## 🎨 Color Coding Reference

```
Priority:
🔴 HIGH (Red)     = Emergency, needs immediate attention
🟡 MEDIUM (Yellow)= Important, this week
🟢 LOW (Green)    = Flexible scheduling

Status:
🔵 REPORTED (Blue)     = New, waiting for assignment
🟣 ASSIGNED (Purple)   = Contractor accepted
🟡 IN_PROGRESS (Yellow)= Work actively happening
🟢 COMPLETED (Green)   = Finished
⚪ CANCELLED (Gray)    = Cancelled

Urgency Timeline:
🔴 Today/now
🟡 This week
🟢 When possible
```

---

## 💡 Pro Tips for Admins

1. **Check HIGH Priority First**: Filter by Priority: High to see urgent issues
2. **Follow UP IN Progress**: These should complete quickly
3. **Assign Quickly**: Don't let jobs sit in "Reported" too long
4. **Review Photos**: Always check tenant photos for severity assessment
5. **Note Contractors**: Use notes to track contractor performance
6. **Prioritize Communal**: Kitchen, bathrooms, hallways affect multiple people
7. **Track Costs**: Monitor estimated vs actual spending

---

**The Admin Dashboard is the control center for all maintenance operations!** 🎛️
