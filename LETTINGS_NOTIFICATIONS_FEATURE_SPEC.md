# Lettings Notifications Feature Specification

**Date:** 2026-08-19  
**Status:** Feature Plan (Templates Seeded)  
**Priority:** High

---

## Overview

Streamlined notification workflow for last-minute viewings and viewing period management. Allow lettings staff to quickly notify tenants directly from the lettings view without leaving the page.

---

## Key Features

### 1. Quick Notify from Lettings Window

**Location:** Lettings tab in property detail page  
**Trigger:** Quick action button on viewing card or "Notify Tenants" CTA  
**Flow:**
- Click "Notify" on a viewing card
- Quick modal appears with viewing details pre-populated
- Select template from dropdown (viewing period, running late, confirmation)
- Send to: "All Tenants" (whole house) or "Specific Tenant" (occupant of viewed room)
- Submit → notification queued

**UI Elements:**
- "📢 Notify Tenants" button on each viewing card
- Quick modal (not full Quick Notify) with template selector
- Toast notification on success

---

### 2. Admin Quick Notify - Lettings Category

**Location:** Admin Quick Notify modal  
**New Category:** "Lettings" alongside Maintenance, Compliance, etc.

**When user selects Lettings → Show:**
- Viewing dropdown selector
- Template options specifically for lettings

**Viewing Selector Options:**
1. **Single Viewing** → Select from list of booked viewings
   - Shows: Room name, Date, Time, Visitor name
   - Pre-populates template with: {{room_name}}, {{date}}, {{time}}

2. **Running Late for Viewing**
   - Dropdown: "Which viewing are you late for?"
   - Picker: New arrival time
   - Pre-populates: {{room_name}}, {{new_time}}

3. **Time Shift All Viewings**
   - Dropdown: "Shift all viewings by:" [15 mins / 30 mins / 1 hour / Custom]
   - Action: Send "Viewing Rescheduled" to all tenants
   - Updates viewing times in database

4. **Viewing Period Notice**
   - Dropdown: Select viewing(s) in a time window
   - Input: "From what time to what time?"
   - Pre-populates: {{start_time}}, {{end_time}}, {{date}}

5. **Multiple Viewings Batch**
   - Shows: "X viewings scheduled [date]"
   - Sends "Multiple Viewings - Time Frame" template

---

### 3. Templates (17 total available)

#### Viewing-Specific (6 templates)
1. **Viewing Notification - Whole House**
   - "Hi All, we have a viewing scheduled for {{room_name}} on {{date}} at {{time}}..."
   - Use: Advance notice of upcoming viewing

2. **Running Late - Select Viewing**
   - "Hi All, I am running late for the viewing at {{room_name}}. I will now be arriving at {{new_time}}..."
   - Use: Last-minute delay notification

3. **Viewing Period Notice**
   - "Hi All, during {{time_period}} I will be holding viewings in {{room_name}}..."
   - Use: Multi-viewing window (no specific times needed)

4. **Viewing Rescheduled - Time Shift**
   - "Hi All, due to scheduling changes, the viewing has been moved from {{original_time}} to {{new_time}}..."
   - Use: When pushing viewings back

5. **Multiple Viewings - Time Frame**
   - "Hi All, we have multiple viewings scheduled between {{start_time}} and {{end_time}} on {{date}}..."
   - Use: Bulk notification for viewing day

6. **Viewing Confirmation - Tenant**
   - "Hi {{tenant_name}}, please confirm {{room_name}} viewing on {{date}} at {{time}}..."
   - Use: Confirm viewing doesn't conflict with tenant

#### General Visiting (11 templates from earlier)
- Communal area visits
- Maintenance visits
- Inspections
- Contractor visits
- etc.

---

## Implementation Checklist

### Phase 1: Backend (Done ✅)
- ✅ Create notification_templates (templates seeded in DB)
- ⏳ Add "lettings" category to Quick Notify modal
- ⏳ Create API endpoint: `POST /api/notify/viewing` to handle viewing-specific notifications

### Phase 2: UI - Lettings Tab
- ⏳ Add "📢 Notify Tenants" button to viewing cards
- ⏳ Build mini quick-notify modal for lettings context
- ⏳ Template selector dropdown
- ⏳ Send to: All Tenants / Specific Tenant radio

### Phase 3: UI - Admin Quick Notify
- ⏳ Add "Lettings" category button to Quick Notify
- ⏳ Show viewing selector when Lettings selected
- ⏳ Viewing dropdown with options:
  - Single viewing (select from list)
  - Running late (which viewing + new time)
  - Time shift (15/30/60 min / custom)
  - Viewing period (multi-viewing batch)
- ⏳ Pre-populate template variables from viewing data

### Phase 4: Enhanced Features
- ⏳ Time shift functionality (update all viewing times + notify tenants)
- ⏳ Batch send logic (send to all current tenants for that property)
- ⏳ Template preview before sending

---

## Data Flow

```
Lettings Tab → Click "Notify" on viewing
             ↓
Quick Mini Modal (template, recipient options)
             ↓
API: POST /api/notify/viewing
  {
    viewingId: "...",
    templateId: "...",
    recipientType: "all_tenants" | "specific_tenant",
    tenantId?: "...",
    variables: {
      room_name: "Room 1",
      date: "2026-08-20",
      time: "14:00",
      ...
    }
  }
             ↓
Send via notification system
```

---

## Template Variables Reference

| Variable | Example | Used In |
|----------|---------|---------|
| `{{room_name}}` | "Room 1" | All viewing templates |
| `{{date}}` | "20 Aug 2026" | All viewing templates |
| `{{time}}` | "14:00" | Viewing Notification, Running Late |
| `{{new_time}}` | "14:30" | Running Late, Rescheduled |
| `{{time_period}}` | "2pm-4pm" | Viewing Period Notice |
| `{{start_time}}` | "10:00" | Multiple Viewings |
| `{{end_time}}` | "18:00" | Multiple Viewings |
| `{{original_time}}` | "13:00" | Viewing Rescheduled |
| `{{tenant_name}}` | "Alice Johnson" | Viewing Confirmation |
| `{{visitor_name}}` | "Jane Smith" | General Viewing Notification |
| `{{salutation}}` | "Hi All" or "Hi {{tenant_name}}" | All templates |

---

## User Stories

### Story 1: Last-Minute Viewing Notification
**As:** Lettings staff  
**I want to:** Quickly notify tenants of a viewing I just booked  
**So that:** Tenants know when to expect a visitor  
**Acceptance:**
- Can send notification directly from viewing card
- Takes <30 seconds (one modal, select template, send)
- Notification goes to all tenants in property

### Story 2: Running Late Update
**As:** Viewing coordinator  
**I want to:** Tell tenants I'm delayed and arriving 30 mins later  
**So that:** They don't stress waiting  
**Acceptance:**
- Quick Notify has "Running Late" option
- Shows which viewing I'm late for (dropdown)
- Pre-fills new arrival time (with edit capability)
- Sends only to viewing room tenant + communal access note

### Story 3: Bulk Time Shift
**As:** Lettings manager  
**I want to:** Move all viewings today back 30 minutes  
**So that:** I can handle another emergency  
**Acceptance:**
- Quick Notify has "Time Shift" option
- Select: 15 min / 30 min / 1 hour / Custom
- All viewing times update in DB
- All tenants notified of new times

### Story 4: Viewing Period Notice (Non-Specific Time)
**As:** Lettings staff  
**I want to:** Tell tenants I'll be doing multiple viewings 2-4pm  
**So that:** They know to expect activity but don't need exact times  
**Acceptance:**
- Can send "Viewing Period" template
- Shows viewing window (2-4pm) and which room
- Prepares tenants without over-specifying times

---

## Success Metrics

- Viewing notifications sent within 1 minute of booking
- 100% of tenants receive viewing notices (no missed notifications)
- Reduce "surprised by viewing" complaints
- Staff can manage viewing disruptions proactively

---

## Notes

- Templates support both whole-house ("Hi All") and individual tenant addressing
- Time format should match user's locale (handled by template variables)
- Running late notifications should go to specific tenant + communal note to all
- Batch operations (time shift) require confirmation dialog
