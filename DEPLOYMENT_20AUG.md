# Property Creation Wizard - Production Deployment
**Date**: 21 August 2026  
**Status**: ✅ Ready for deployment

---

## 📋 What's Deploying

### New Database Migrations
1. **Migration 072**: `add_landlord_and_tenancy_settings.sql`
   - Landlord: name, email, phone
   - Property Features: has_gas, has_electric, has_oil, furnished_status
   - Tenancy: bills_included, notice_period_months
   - Council Tax Band field

2. **Migration 073**: `add_council_information.sql`
   - Council: name, email, phone, website
   - Bin collection data

### New Frontend Features
- ✅ Property creation wizard (6 sections)
- ✅ Council lookup modal (accept/reject)
- ✅ Auto-generated property + unit codes
- ✅ Utilities & furnished status selection
- ✅ Compact, professional UI

---

## 🔧 Deployment Steps

### Option 1: Supabase CLI (Recommended)
```bash
cd /Users/boo/Documents/Claude/cros
supabase migration up
```

### Option 2: Supabase Dashboard (Manual)
1. Open Supabase console → SQL Editor
2. Run Migration 072 SQL (copy from file)
3. Run Migration 073 SQL (copy from file)
4. Verify tables updated with new columns

### Verification Checklist
- [ ] Migration 072 applied (8 new columns in properties table)
- [ ] Migration 073 applied (5 new columns in properties table)
- [ ] Test property creation on localhost (should work now)
- [ ] Verify data saves to production database

---

## 📊 New Schema Fields

### Properties Table
```
landlord_name (VARCHAR 255)
landlord_email (VARCHAR 255)
landlord_phone (VARCHAR 20)
has_gas (BOOLEAN)
has_electric (BOOLEAN)
has_oil (BOOLEAN)
furnished_status (VARCHAR 20)
bills_included (BOOLEAN)
notice_period_months (INT)
council_tax_band (CHAR 1)
council_name (VARCHAR 255)
council_email (VARCHAR 255)
council_phone (VARCHAR 20)
council_website (VARCHAR 500)
bin_collection_day (VARCHAR 50)
bin_collection_info (JSONB)
```

---

## ✅ Testing Checklist Post-Deploy

- [ ] Navigate to `/admin/properties/new`
- [ ] Enter address (e.g., "52 Manchester Street, Manchester M1 1AD")
- [ ] Council modal appears and accepts
- [ ] Select utilities & furnished status
- [ ] Select 3 rooms with types
- [ ] Click Create Property
- [ ] Verify property appears in properties list
- [ ] Click into property detail page
- [ ] Verify all data saved correctly

---

## 🎯 Success Criteria

✅ Property created with all fields  
✅ Council data populated from lookup  
✅ Unit codes auto-generated  
✅ Property displays on list  
✅ All sections complete in Property detail page  

---

**Ready to deploy!**
