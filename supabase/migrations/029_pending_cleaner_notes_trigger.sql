-- Migration 029: Auto-attach pending cleaner notes trigger
-- When a new clean is scheduled, automatically attach any pending notes for that property

CREATE OR REPLACE FUNCTION attach_pending_cleaner_notes()
RETURNS TRIGGER AS $$
DECLARE
  pending_content TEXT;
BEGIN
  -- Get all pending notes for this property that haven't been attached
  SELECT STRING_AGG(
    COALESCE(title, '') || E'\n' || content,
    E'\n\n---\n\n'
    ORDER BY created_at ASC
  )
  INTO pending_content
  FROM pending_cleaner_notes
  WHERE property_id = NEW.property_id
    AND attached_to_clean_id IS NULL;

  -- If there are pending notes, attach them to this clean
  IF pending_content IS NOT NULL THEN
    NEW.admin_note = COALESCE(NEW.admin_note, '') || 
                     CASE WHEN NEW.admin_note IS NOT NULL THEN E'\n\n---\n\n' ELSE '' END ||
                     pending_content;

    -- Mark all pending notes as attached
    UPDATE pending_cleaner_notes
    SET attached_to_clean_id = NEW.id
    WHERE property_id = NEW.property_id
      AND attached_to_clean_id IS NULL;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Drop existing trigger if it exists
DROP TRIGGER IF EXISTS trigger_attach_pending_notes ON cleans;

-- Create trigger on cleans table insert
CREATE TRIGGER trigger_attach_pending_notes
BEFORE INSERT ON cleans
FOR EACH ROW
EXECUTE FUNCTION attach_pending_cleaner_notes();
