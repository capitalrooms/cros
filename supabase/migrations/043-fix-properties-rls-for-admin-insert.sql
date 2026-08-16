-- Migration 043: Fix Properties RLS to Allow Admin Insert
-- Issue: RLS policy for INSERT on properties was blocking admin users
-- Fix: Allow both 'administrator' and 'admin' roles, and accept authenticated service_role

-- Drop existing restrictive policy
DROP POLICY IF EXISTS "admin_only_write_properties" ON public.properties;

-- Create new policy that accepts multiple admin role variants
CREATE POLICY "admin_can_insert_properties" ON public.properties
  FOR INSERT WITH CHECK (
    -- Allow authenticated users with administrator or admin role
    EXISTS(
      SELECT 1 FROM people
      WHERE people.id = auth.uid()
      AND people.role IN ('administrator', 'admin')
    )
    OR
    -- Allow service role (for backend operations)
    auth.jwt() ->> 'role' = 'service_role'
  );

-- Also update SELECT and UPDATE policies for consistency
DROP POLICY IF EXISTS "read_properties_if_admin_lettings_cleaner" ON public.properties;

CREATE POLICY "read_properties_if_authorized" ON public.properties
  FOR SELECT USING (
    EXISTS(
      SELECT 1 FROM people
      WHERE people.id = auth.uid()
      AND people.role IN ('administrator', 'admin', 'lettings', 'cleaner', 'landlord')
    )
    OR auth.jwt() ->> 'role' = 'service_role'
  );

-- Update UPDATE policy to allow both admin variants
DROP POLICY IF EXISTS "admin_only_update_properties" ON public.properties;

CREATE POLICY "admin_can_update_properties" ON public.properties
  FOR UPDATE USING (
    EXISTS(
      SELECT 1 FROM people
      WHERE people.id = auth.uid()
      AND people.role IN ('administrator', 'admin')
    )
    OR auth.jwt() ->> 'role' = 'service_role'
  );

-- Also add DELETE policy for completeness (allows admin to delete properties)
DROP POLICY IF EXISTS "admin_can_delete_properties" ON public.properties;

CREATE POLICY "admin_can_delete_properties" ON public.properties
  FOR DELETE USING (
    EXISTS(
      SELECT 1 FROM people
      WHERE people.id = auth.uid()
      AND people.role IN ('administrator', 'admin')
    )
    OR auth.jwt() ->> 'role' = 'service_role'
  );

-- Same for rooms table (used by bulk room creation)
DROP POLICY IF EXISTS "admin_only_write_rooms" ON public.rooms;

CREATE POLICY "admin_can_insert_rooms" ON public.rooms
  FOR INSERT WITH CHECK (
    EXISTS(
      SELECT 1 FROM people
      WHERE people.id = auth.uid()
      AND people.role IN ('administrator', 'admin')
    )
    OR auth.jwt() ->> 'role' = 'service_role'
  );
