-- Add property_type column to properties table
ALTER TABLE properties
ADD COLUMN property_type VARCHAR(20) DEFAULT 'hmo' CHECK (property_type IN ('hmo', 'single_let'));

-- Add comment
COMMENT ON COLUMN properties.property_type IS 'Type of property: hmo (multi-let) or single_let (single family/couple)';
