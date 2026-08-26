-- Fix RLS policies for property_extended_details - simplify to be permissive
DROP POLICY IF EXISTS "property_extended_details_admin_all" ON property_extended_details;
DROP POLICY IF EXISTS "property_extended_details_landlord_read" ON property_extended_details;

-- Permissive RLS - allow everyone to read/write (service role will be used for inserts)
CREATE POLICY "property_extended_details_all_select" ON property_extended_details
  FOR SELECT USING (true);

CREATE POLICY "property_extended_details_all_insert" ON property_extended_details
  FOR INSERT WITH CHECK (true);

CREATE POLICY "property_extended_details_all_update" ON property_extended_details
  FOR UPDATE USING (true) WITH CHECK (true);

CREATE POLICY "property_extended_details_all_delete" ON property_extended_details
  FOR DELETE USING (true);
