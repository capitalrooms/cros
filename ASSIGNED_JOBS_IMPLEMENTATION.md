# Assigned Jobs Feature - Implementation Status

## ✅ COMPLETED

### Database (Migration 058)
- ✅ `assigned_jobs` table created
- ✅ Fields: id, property_id, room_id, cleaner_id, assigned_by, task_type, notes, status
- ✅ RLS policies: Admins can manage all, cleaners can view/update their own
- ✅ Indexes on cleaner_id, property_id, status
- ✅ Triggers for updated_at

### API Endpoints
1. ✅ `POST /api/jobs/assign` - Admin assigns job
   - Input: property_id, room_id, cleaner_id, task_type, notes
   - Returns: created job record
   
2. ✅ `GET /api/jobs/assigned` - Cleaner views assigned jobs
   - Returns: list of pending/accepted jobs with property, room, admin details
   
3. ✅ `PUT /api/jobs/[id]/accept` - Cleaner accepts and books clean
   - Input: clean_date, clean_time
   - Creates clean entry + updates job status to 'accepted'
   - Returns: success message

## 📝 REMAINING UI WORK

### 1. Admin Interface: "Assign Job" Modal
**Location:** `app/admin/properties/[id]/components/PropertyDetail.tsx`

Add button in property header:
```tsx
<button 
  onClick={() => setShowAssignJobModal(true)}
  className="rounded-lg bg-blue-500 px-md py-sm text-xs font-bold text-white hover:bg-blue-600"
>
  📌 Assign Cleaning Task
</button>
```

Modal component `app/admin/components/AssignJobModal.tsx`:
```tsx
- Room selector (dropdown)
- Cleaner selector (dropdown)
- Task type: Normal / Urgent / ASAP (buttons with color)
- Notes textarea
- "Assign Task" button
```

### 2. Cleaner Dashboard: "Assigned Jobs" Section
**Location:** `app/cleaner/page.tsx`

Add new section after "Book a clean":
```tsx
<section className="mt-3xl">
  <h2 className="text-xl font-bold">📌 Assigned Jobs</h2>
  {assignedJobs.length === 0 ? (
    <p className="text-sm text-neutral-400">No assigned jobs</p>
  ) : (
    <div className="space-y-sm">
      {assignedJobs.map(job => (
        <div key={job.id} className={`rounded-2xl border-2 p-md ${
          job.task_type === 'asap' ? 'border-red-500 bg-red-900' :
          job.task_type === 'urgent' ? 'border-orange-500 bg-orange-900' :
          'border-blue-500 bg-blue-900'
        } text-white`}>
          <p className="font-bold">{job.properties.name} - {job.rooms.name}</p>
          <p className="text-sm text-neutral-300 mt-xs">{job.notes}</p>
          <p className="text-xs text-neutral-400 mt-xs">Assigned by: Admin</p>
          <button className="mt-md rounded-lg bg-white px-md py-sm text-sm font-bold text-neutral-900 hover:bg-neutral-100">
            Accept & Book
          </button>
        </div>
      ))}
    </div>
  )}
</section>
```

Add to cleaner page state:
```tsx
const [assignedJobs, setAssignedJobs] = useState<any[]>([])

async function loadAssignedJobs() {
  const { data } = await supabase.from('assigned_jobs')
    .select('*, properties(name), rooms(name)')
    .eq('cleaner_id', me?.id)
    .in('status', ['pending', 'accepted'])
  
  setAssignedJobs(data || [])
}
```

Add to useEffect initialization.

### 3. Accept Job Modal
When cleaner clicks "Accept & Book":
- Open modal asking for clean_date and clean_time
- Call `PUT /api/jobs/[id]/accept`
- Reload assigned jobs and cleans
- Show success message

## 🎨 Color Scheme
- **ASAP**: `bg-red-900 border-red-500 text-white`
- **Urgent**: `bg-orange-900 border-orange-500 text-white`
- **Normal**: `bg-blue-900 border-blue-500 text-white`

## 🔄 Data Flow
```
Admin assigns job
  ↓
POST /api/jobs/assign
  ↓
Cleaner sees "Assigned Jobs" section
  ↓
Cleaner clicks "Accept & Book"
  ↓
PUT /api/jobs/[id]/accept
  ↓
Creates clean entry + updates job status
  ↓
Shows in "Upcoming cleans" section
```

## 📋 Testing Checklist
- [ ] Admin can assign job from property page
- [ ] Cleaner sees assigned job in dashboard
- [ ] Cleaner can accept and book with date/time
- [ ] Job moves to "accepted" status
- [ ] Clean appears in "Upcoming cleans"
- [ ] Notifications sent to cleaner (if enabled)
- [ ] On-notice room case works (Harry B room)

## 🚀 Next Steps
1. Create AssignJobModal component
2. Add "Assign Task" button to property detail page
3. Add "Assigned Jobs" section to cleaner dashboard
4. Add "Accept Job" modal/logic to cleaner dashboard
5. Test end-to-end
6. Deploy migration 058
7. Test on production
