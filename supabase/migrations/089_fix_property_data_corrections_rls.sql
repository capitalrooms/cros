-- Fix RLS policies for property_data_corrections - simplify to be permissive
DROP POLICY IF EXISTS "property_data_corrections_admin_all" ON property_data_corrections;
DROP POLICY IF EXISTS "property_data_corrections_landlord_read" ON property_data_corrections;
DROP POLICY IF EXISTS "property_data_corrections_landlord_insert" ON property_data_corrections;

-- Permissive RLS - allow everyone to read/write (service role will be used for updates)
CREATE POLICY "property_data_corrections_all_select" ON property_data_corrections
  FOR SELECT USING (true);

CREATE POLICY "property_data_corrections_all_insert" ON property_data_corrections
  FOR INSERT WITH CHECK (true);

CREATE POLICY "property_data_corrections_all_update" ON property_data_corrections
  FOR UPDATE USING (true) WITH CHECK (true);

CREATE POLICY "property_data_corrections_all_delete" ON property_data_corrections
  FOR DELETE USING (true);
