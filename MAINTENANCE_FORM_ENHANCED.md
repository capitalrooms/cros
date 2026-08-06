# Enhanced Maintenance Reporting Form

## 🏘️ Multi-Occupancy Support - Location Selector

The maintenance reporting form now includes a **Location** dropdown to handle multi-occupancy properties where tenants need to report issues in shared spaces, not just their own room.

---

## 📋 Updated Form Structure

### **Issue Title** *
```
Input: Text field
Placeholder: "e.g., Leaky kitchen tap"
Example: "Bathroom tap dripping constantly"
```

### **Category** *
```
Dropdown with 8 options:
- Plumbing
- Electrical
- Heating/Cooling
- Appliances
- Paint/Walls
- Flooring
- Windows/Doors
- Other
```

### **Location** * ← NEW!
```
Dropdown with 12 location options:
- My Room/Bedroom (default)
- Kitchen
- Lounge/Living Room
- Ground Floor Hallway
- First Floor Hallway
- Ground Floor Bathroom
- First Floor Bathroom
- Stairs
- Front Entrance
- Back Door/Garden
- Shared Storage
- Other Communal Area
```

### **Description** *
```
Textarea: 5 rows
Placeholder: "Describe the issue in detail..."
Example: "The main bathroom tap is dripping from the main spout, not the overflow..."
```

### **Priority** *
```
Radio buttons (choose one):
◯ Low
◉ Medium (default)
◯ High
```

---

## 📍 Why Location Matters

### **4 Willis Road, E153HH Example**

```
Property Structure:
├── Room 1 → Tenant A (Alice)
├── Room 2 → Tenant B (Bob)
├── Room 3 → Tenant C (Charlie)
├── Kitchen (SHARED)
├── Lounge (SHARED)
├── Ground Floor Bathroom (SHARED)
├── First Floor Bathroom (SHARED)
└── Hallways (SHARED)
```

### **Example Tickets from Same Property**

| Tenant | Location | Issue | Priority |
|--------|----------|-------|----------|
| Alice | My Room/Bedroom | Leaky radiator | Low |
| Bob | Kitchen | Cooker not heating | High |
| Charlie | First Floor Bathroom | Shower pressure low | Medium |
| Alice | Ground Floor Hallway | Light bulb out | Low |
| Bob | Stairs | Carpet fraying | Low |

---

## 🔄 Data Flow with Location

### **Database Record**
```javascript
{
  id: "ticket-001",
  property_id: "4-willis-road-e153hh",
  room_id: null,  // Null for communal areas
  location: "Kitchen",
  reporter_id: "bob-123",
  title: "Cooker not heating",
  description: "The main oven won't heat up...",
  category: "Appliances",
  priority: "high",
  status: "reported",
  created_at: "2026-08-04T14:32:00Z"
}
```

### **Admin Dashboard View**
```
Property: 4 Willis Road, E153HH
├── Kitchen
│   └── Cooker not heating (HIGH) - reported by Bob
├── Ground Floor Hallway
│   └── Light bulb out (LOW) - reported by Alice
├── First Floor Bathroom
│   └── Shower pressure low (MEDIUM) - reported by Charlie
└── Room 3
    └── Leaky radiator (LOW) - reported by Alice
```

---

## 🎯 Tenant Workflow with Location

### **Step 1: Tenant Selects Location**
```
"I want to report an issue in the Kitchen (shared)"
→ Selects "Kitchen" from Location dropdown
```

### **Step 2: System Auto-Captures**
```
✓ Reporter: Charlie (logged-in user)
✓ Property: 4 Willis Road, E153HH (from tenant account)
✓ Location: Kitchen (from dropdown)
✓ Room: null (because it's a communal area)
✓ Status: reported
```

### **Step 3: Admin Sees Complete Context**
```
"Kitchen issue at 4 Willis Road"
- Not tied to a specific room
- But tied to the property
- Admin knows exactly where to look
- Can assign to appropriate contractor (plumber, electrician, etc.)
```

---

## 🏢 Property-Centric Ticket Organization

Admin Dashboard can now show:

```
4 WILLIS ROAD, E153HH
│
├─ COMMUNAL AREAS
│  ├─ Kitchen
│  │  └─ [2 tickets]
│  ├─ Lounge
│  │  └─ [1 ticket]
│  ├─ Ground Floor Hallway
│  │  └─ [1 ticket]
│  ├─ First Floor Hallway
│  │  └─ [0 tickets]
│  └─ Bathrooms
│     ├─ Ground Floor
│     │  └─ [1 ticket]
│     └─ First Floor
│        └─ [1 ticket]
│
└─ TENANT ROOMS
   ├─ Room 1 (Alice)
   │  └─ [1 ticket]
   ├─ Room 2 (Bob)
   │  └─ [0 tickets]
   ├─ Room 3 (Charlie)
   │  └─ [0 tickets]
   ├─ Room 4 (Empty)
   │  └─ [0 tickets]
   └─ Rooms 5-7 (Other tenants)
      └─ [0 tickets]
```

---

## 🔧 Future Enhancement Ideas

### **Smart Location Lists**
Instead of hardcoded locations, the system could:
1. Store property layouts in database
2. Admin defines rooms and communal areas per property
3. Tenant dropdown shows only locations in THEIR property
4. Dynamic based on property structure

### **Example Database**
```
Properties table:
- id: "4-willis"
- name: "4 Willis Road"
- address: "E153HH"
- property_locations: [
    { id: "room-1", type: "bedroom", name: "Room 1" },
    { id: "room-2", type: "bedroom", name: "Room 2" },
    { id: "kitchen", type: "communal", name: "Kitchen" },
    { id: "lounge", type: "communal", name: "Lounge" },
    { id: "gf-hallway", type: "communal", name: "Ground Floor Hallway" },
    { id: "gf-bathroom", type: "communal", name: "Ground Floor Bathroom" },
    { id: "ff-bathroom", type: "communal", name: "First Floor Bathroom" },
  ]
```

---

## ✨ Benefits

### **For Tenants**
✓ Clear options for where the issue is  
✓ No ambiguity about location  
✓ Easy to select from dropdown  
✓ Defaults to their own room for privacy  

### **For Admin**
✓ Knows exactly where maintenance is needed  
✓ Can prioritize by location  
✓ Can assign right contractors  
✓ Can track issues by area  
✓ Supports multi-occupancy model  

### **For Property Managers**
✓ Complete property maintenance map  
✓ Can see problem areas  
✓ Can identify patterns (e.g., bathroom issues recurring)  
✓ Better resource planning  

---

## 📊 Practical Example

### **Morning at 4 Willis Road**

```
09:00 - Alice reports: My Room/Bedroom - Radiator leaking
        → Issue in Room 1

10:30 - Bob reports: Kitchen - Tap dripping
        → Issue in shared kitchen (affects everyone)

11:15 - Charlie reports: Ground Floor Bathroom - No hot water
        → Issue in shared bathroom (affects everyone)

Admin Dashboard immediately shows:
Priority: Fix bathroom hot water (affects 5 tenants!)
          Fix kitchen tap (affects 5 tenants!)
          Fix Alice's radiator (affects 1 tenant)
```

---

## 🎓 Key Design Insight

**Location field bridges two models**:

```
TENANT'S VIEW:
"My Room" → Reports issue in their room
"Kitchen" → Reports issue in communal space

SYSTEM VIEW:
Tenant's Room → room_id = "room-3", location = null
Communal area → room_id = null, location = "Kitchen"

ADMIN VIEW:
All tickets from property, organized by location
```

This supports the master-data model:
- **Property** = static, the location
- **Rooms** = fixed structure  
- **Tenants** = dynamic assignments
- **Locations** = where issue occurs (own room or communal)

---

## ✅ Implementation Status

- ✅ Location field added to form
- ✅ 12 common areas in dropdown
- ✅ Location stored in database
- ✅ Defaults to "My Room/Bedroom" for privacy
- ⏳ Admin dashboard can filter by location (future)
- ⏳ Reports organized by location (future)
- ⏳ Dynamic location lists per property (future enhancement)

---

This enhancement makes CROS perfect for **multi-occupancy properties** where maintenance can occur anywhere in the building, not just individual rooms! 🏘️

