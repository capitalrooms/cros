-- Auto-Attach Pending Cleaner Notes
-- When a new clean is booked, automatically attach any pending notes for that property

-- Create a function to attach pending notes to a newly booked clean
CREATE OR REPLACE FUNCTION attach_pending_cleaner_notes()
RETURNS TRIGGER AS $$
BEGIN
  -- Concatenate all pending notes for this property (that haven't been attached)
  WITH pending AS (
    SELECT id, title, content
    FROM pending_cleaner_notes
    WHERE property_id = NEW.property_id
    AND attached_to_clean_id IS NULL
    ORDER BY created_at ASC
  ),
  concatenated AS (
    SELECT string_agg(title || E'\n\n' || content, E'\n\n---\n\n') AS full_note
    FROM pending
  )
  UPDATE cleans
  SET admin_note = concatenated.full_note
  FROM concatenated
  WHERE cleans.id = NEW.id
  AND concatenated.full_note IS NOT NULL;

  -- Mark all pending notes as attached to this clean
  UPDATE pending_cleaner_notes
  SET attached_to_clean_id = NEW.id, attached_at = NOW()
  WHERE property_id = NEW.property_id
  AND attached_to_clean_id IS NULL;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Drop the trigger if it exists
DROP TRIGGER IF EXISTS trigger_attach_pending_notes ON public.cleans;

-- Create the trigger that fires when a new clean is inserted
CREATE TRIGGER trigger_attach_pending_notes
AFTER INSERT ON public.cleans
FOR EACH ROW
EXECUTE FUNCTION attach_pending_cleaner_notes();
