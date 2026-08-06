# Enhanced Maintenance System - v1.1 Specification

## 📸 Critical Addition: Photo/Video Support + Equipment Tracking

The system needs to evolve from simple issue reporting to **rich diagnostic information** including photos/videos and equipment details.

---

## 🎥 Photo/Video Upload

### **Why Photos Matter**
```
Text: "Tap is dripping"
      ↓
Photo: Shows water pooling, staining, etc.
       Contractor can see severity immediately
       ✓ Faster diagnosis
       ✓ Accurate quotes
       ✓ Proper tools/parts ordered
```

### **Implementation**
- Upload photos immediately with form
- Multiple photos per ticket (up to 5-10)
- Video option for dynamic issues (leaking, noise, etc.)
- Photos stored with ticket for reference

---

## 🔧 Equipment/Asset Tracking

### **Current Problem**
```
Tenant reports: "Dishwasher not working"
Admin thinks: "Which dishwasher? What model? Where's the serial number?"
Contractor arrives: "I need the manual, specs, age..."
Wasted time, delays
```

### **Solution: Equipment Registry**

Each property has an **Asset Inventory**:

```
4 WILLIS ROAD, E153HH
├─ Kitchen
│  ├─ Dishwasher (Bosch SMV50C10GB)
│  │  ├─ Serial: DW123456789
│  │  ├─ Installed: 2019
│  │  ├─ Label location: Inside door rim
│  │  └─ Manual: [link to PDF]
│  ├─ Cooker (Hotpoint HAE60PS)
│  │  ├─ Serial: CO987654321
│  │  ├─ Installed: 2018
│  │  ├─ Label location: Back panel
│  │  └─ Manual: [link to PDF]
│  └─ Fridge (Indesit TIAA10)
│     ├─ Serial: FR111222333
│     ├─ Installed: 2017
│     ├─ Label location: Inside top corner
│     └─ Manual: [link to PDF]
│
├─ Bathrooms
│  ├─ Boiler (Baxi Combi 24HE)
│  │  ├─ Serial: BO456789012
│  │  ├─ Installed: 2020
│  │  ├─ Label location: Side panel
│  │  ├─ Manual: [link to PDF]
│  │  └─ Warranty: Until 2025
│  ├─ Washing Machine (GF555-WM)
│  │  └─ [details...]
│  └─ Toilet Cistern (Roca A341098)
│     └─ [details...]
│
└─ Other
   ├─ Boiler (primary heating)
   ├─ Water Tank
   ├─ Electrical Panel
   └─ Locks & Access
```

---

## 📋 Enhanced Maintenance Form

### **Structure**

```
1. ISSUE BASICS
   ├─ Issue Title *
   ├─ Category *
   ├─ Location *
   └─ Description *

2. EQUIPMENT (NEW)
   ├─ Is this about equipment/appliance? [Yes/No]
   ├─ If Yes → Select Equipment *
   │  └─ Shows: Brand, Model, Serial, Install Date
   └─ If No → Skip

3. DETAILED INFO (NEW)
   ├─ What were you doing when it happened?
   ├─ When did it start?
   ├─ Is it getting worse?
   └─ Any sounds/smells/warnings?

4. PHOTOS/VIDEOS (NEW)
   ├─ Upload photos of the issue (required)
   │  └─ "Show the problem clearly"
   ├─ Upload equipment label/nameplate (if applicable)
   │  └─ "Photo of model/serial number"
   └─ Video demonstration (optional)
      └─ "Show the issue happening"

5. PRIORITY & IMPACT
   ├─ How urgent is this? [Low/Medium/High]
   ├─ Does this affect other residents? [Yes/No]
   └─ If Yes → How many?

6. AVAILABILITY
   ├─ When are you usually home?
   ├─ Preferred contact method
   └─ Contractor access notes
```

---

## 🔗 Equipment Linking Example

### **Dishwasher Not Washing**

**Tenant submits:**
```
Title: "Dishwasher not cleaning dishes"
Location: Kitchen
Equipment: [Select from dropdown]
          → Bosch SMV50C10GB (Serial: DW123456789)
Photos:   [Dirty dishes inside]
          [Equipment label showing model/serial]
Video:    [30-second clip of cycle running]
```

**System captures:**
```
{
  ticket_id: "TKT-001",
  property_id: "4-willis",
  location: "Kitchen",
  equipment_id: "dishwasher-001",
  equipment: {
    brand: "Bosch",
    model: "SMV50C10GB",
    serial: "DW123456789",
    installed: "2019",
    warranty_expires: "2024-06-15",
    manual_url: "https://...",
    common_issues: ["Water not spraying", "Not draining", ...]
  },
  photos: [
    { url: "issue-1.jpg", caption: "Dirty dishes" },
    { url: "label.jpg", caption: "Model/Serial label" }
  ],
  video: "issue-demo.mp4",
  status: "reported"
}
```

**Admin/Contractor sees:**
```
✓ Exact model and serial number
✓ Photos of the problem
✓ Video of the malfunction
✓ Link to manual
✓ Common issues for this model
✓ Warranty status
✓ Installation date (age of equipment)

→ Can order exact parts
→ Can send specialist if needed
→ Can provide repair estimate instantly
```

---

## 🏢 Equipment Management Features

### **For Property Manager**
1. **Asset Registry**: Add/edit equipment details
2. **Maintenance History**: See all issues per appliance
3. **Warranty Tracking**: Know what's still covered
4. **Manuals Library**: Store PDFs and documentation
5. **Service Contracts**: Link to service providers

### **For Tenant**
1. **Equipment Selection**: Easy dropdown to pick appliance
2. **Auto-populated Info**: Model, serial, install date shown
3. **Instructions**: "Where to find the label" tips
4. **Photos Required**: Ensures good diagnostics

### **For Contractor**
1. **Full Equipment Data**: No need to ask questions
2. **Photos/Video**: See the problem before arriving
3. **Manual Access**: Instant documentation
4. **Common Issues**: Know typical problems for this model

---

## 📁 File Structure with Photos

```
maintenance_tickets/
├─ ticket-001/
│  ├─ ticket-data.json
│  ├─ photos/
│  │  ├─ issue-1.jpg (2.4 MB)
│  │  ├─ label.jpg (1.8 MB)
│  │  └─ damage-overview.jpg (3.1 MB)
│  └─ videos/
│     └─ malfunction-demo.mp4 (45 MB)
│
└─ ticket-002/
   ├─ ticket-data.json
   ├─ photos/
   │  └─ leaking-water.jpg (2.1 MB)
   └─ (no video)
```

---

## 🎬 Photo/Video Upload Implementation

### **Simple Upload Interface**
```
┌─────────────────────────────────────┐
│ Photos of the Problem               │
│                                     │
│ [Drag photos here or click]         │
│                                     │
│ ✓ Photo 1 - Issue overview (2.4MB) │
│ ✓ Photo 2 - Close-up damage (1.8MB)│
│ ○ Photo 3 - [Empty slot]            │
│ ○ Photo 4 - [Empty slot]            │
│                                     │
│ Max 10 photos, 50MB total per ticket│
├─────────────────────────────────────┤
│ Equipment Label (if applicable)     │
│                                     │
│ [Upload model/serial number photo]  │
│                                     │
│ ✓ Equipment label (1.5MB)          │
│                                     │
│ Helps us identify exact model       │
└─────────────────────────────────────┘

Optional: Video Demo
┌─────────────────────────────────────┐
│ [Record 30-second video OR upload]  │
│ Shows the issue happening           │
│ (Very helpful for diagnosis!)       │
└─────────────────────────────────────┘
```

---

## 🔍 Advanced Equipment Features

### **Equipment Label Recognition** (Future)
- Tenant takes photo of label
- AI reads model/serial automatically
- Auto-populates equipment details
- Reduces manual data entry

### **Common Issues Database**
```
Bosch SMV50C10GB - Common Issues:
1. "Not draining" → Usually filter blockage
2. "Water not spraying" → Arm seal issue
3. "Won't start" → Door latch problem
4. "Detergent not dispensing" → Dispenser jam

Each issue links to:
- YouTube repair videos
- Common solutions
- Part numbers
- Estimated repair cost
- DIY vs. professional
```

### **Predictive Maintenance**
```
If boiler is 7 years old and hasn't been serviced:
→ Admin gets alert: "Boiler due for annual service"

If washing machine had 3 repairs in 6 months:
→ Suggest replacement vs. continuing repairs
```

---

## 🚀 Implementation Roadmap

### **Phase 1** (Immediate)
- ✅ Photo upload to maintenance form
- ✅ Equipment dropdown (static list)
- ✅ Auto-populate equipment details
- ✅ Photos displayed in admin dashboard

### **Phase 2** (Next)
- Video upload support
- Equipment management UI (add/edit/delete)
- Manual/documentation storage
- Warranty tracking

### **Phase 3** (Future)
- AI label recognition
- Common issues database per model
- Predictive maintenance alerts
- Service contract management

---

## 💾 Database Updates Needed

### **New Tables**

```sql
CREATE TABLE equipment (
  id UUID PRIMARY KEY,
  property_id UUID REFERENCES properties(id),
  location VARCHAR(100),
  category VARCHAR(50),    -- "Dishwasher", "Boiler", etc.
  brand VARCHAR(100),
  model VARCHAR(100),
  serial_number VARCHAR(100),
  installed_date DATE,
  warranty_expires DATE,
  manual_url TEXT,
  notes TEXT,
  created_at TIMESTAMP
);

CREATE TABLE ticket_attachments (
  id UUID PRIMARY KEY,
  ticket_id UUID REFERENCES maintenance_tickets(id),
  attachment_type VARCHAR(20),  -- "photo", "video", "document"
  file_name VARCHAR(255),
  file_path TEXT,
  file_size INTEGER,
  storage_url TEXT,            -- Supabase/S3 URL
  description TEXT,
  uploaded_by UUID REFERENCES people(id),
  created_at TIMESTAMP
);
```

### **Updated maintenance_tickets Table**
```sql
ALTER TABLE maintenance_tickets ADD COLUMN equipment_id UUID REFERENCES equipment(id);
```

---

## 🎯 Why This Matters

```
BEFORE (Current):
Tenant: "Dishwasher broken"
Admin: "Which one? What model?"
Contractor: "I need to see it... maybe bring wrong parts"
Result: Multiple visits, delays, frustration

AFTER (Enhanced):
Tenant: [Uploads 3 photos, video, equipment details auto-filled]
Admin: [Sees exact issue with photos/video, knows model, warranty status]
Contractor: [Arrives with exact parts, manual already reviewed]
Result: One visit fix, happy tenant, no wasted time/money
```

---

## ✨ Key Benefits

### **For Tenants**
- ✓ Faster repairs (contractor knows exactly what to bring)
- ✓ Better diagnostics (photos + video = accurate assessment)
- ✓ No equipment confusion (dropdown selection, not text)
- ✓ Professional experience (feels like proper service)

### **For Admin/Property Manager**
- ✓ Maintenance history per equipment
- ✓ Warranty tracking (catch issues while covered)
- ✓ Predictive maintenance (know when things will fail)
- ✓ Cost optimization (repair vs. replace decisions)

### **For Contractors**
- ✓ No guessing games
- ✓ Pre-diagnosis before arrival
- ✓ Correct parts first time
- ✓ Accurate quotes (see problem directly)

---

## 🏆 This Is Professional Maintenance

This transforms from a basic "report a problem" system to a **professional property management platform** that handles the real complexity of multi-occupancy buildings.

It's the difference between:
- "Something's broken" ← Basic
- "Bosch SMV50C10GB not draining - photo of water pooling, video of cycle" ← Professional

