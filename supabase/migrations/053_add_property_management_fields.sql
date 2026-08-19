-- Migration 053: Add Property Management Fields
-- Adds landlord relationship, property structure type, and policies table for v1090

-- Add missing fields to properties table
ALTER TABLE public.properties
  ADD COLUMN IF NOT EXISTS landlord_id UUID REFERENCES public.people(id),
  ADD COLUMN IF NOT EXISTS property_type VARCHAR(50) DEFAULT 'house'; -- house, flat, detached, semi-detached, terrace, bungalow

-- Create property_policies table for appliance and building coverage tracking
CREATE TABLE IF NOT EXISTS public.property_policies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id UUID NOT NULL REFERENCES public.properties(id) ON DELETE CASCADE,

  -- Policy type: 'appliance', 'building', 'liability'
  policy_type VARCHAR(50) NOT NULL,

  -- For appliance policies: which appliance(s) are covered
  appliance_type VARCHAR(100), -- 'boiler', 'kitchen', 'washing_machine', 'cooker', etc.
  appliances_covered TEXT[], -- Array of specific appliances: ['Boiler', 'Central Heating Pump']

  -- Provider and policy details
  provider_name VARCHAR(255) NOT NULL,
  policy_number VARCHAR(100) NOT NULL,

  -- Financial tracking
  monthly_cost NUMERIC(10,2) NOT NULL DEFAULT 0,
  annual_cost NUMERIC(10,2),

  -- Dates
  start_date DATE,
  renewal_date DATE,

  -- Links to documents
  policy_document_id UUID REFERENCES public.attachments(id) ON DELETE SET NULL,
  certificate_document_id UUID REFERENCES public.attachments(id) ON DELETE SET NULL,

  -- Admin notes
  notes TEXT,

  -- Tracking
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_by UUID REFERENCES public.people(id) ON DELETE SET NULL
);

-- Create indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_property_policies_property_id ON public.property_policies(property_id);
CREATE INDEX IF NOT EXISTS idx_property_policies_policy_type ON public.property_policies(property_type);
CREATE INDEX IF NOT EXISTS idx_property_policies_renewal_date ON public.property_policies(renewal_date);

-- Enable RLS
ALTER TABLE public.property_policies ENABLE ROW LEVEL SECURITY;

-- Create basic RLS policies (admin read/write, others read)
CREATE POLICY "admin_manage_property_policies" ON public.property_policies
  FOR ALL USING (
    EXISTS(SELECT 1 FROM people WHERE people.id = auth.uid() AND people.role = 'administrator')
  );

-- Create trigger for updated_at
CREATE TRIGGER update_property_policies_updated_at BEFORE UPDATE ON public.property_policies
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
