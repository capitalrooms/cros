-- Migration 029: Auto-attach pending cleaner notes to newly-scheduled cleans
--
-- When admin adds a note for a property whose cleaner has no upcoming visit,
-- the note is saved to `pending_cleaner_notes`. When the next clean is
-- scheduled for that property, this trigger:
--   1. concatenates all unattached pending notes for that property, and
--   2. appends them to the new clean's admin_note, and
--   3. marks the pending notes as attached (so they don't attach again).
--
-- CRITICAL: The trigger fires AFTER INSERT so that NEW.id is already present
-- in the `cleans` table when we update `pending_cleaner_notes.attached_to_clean_id`
-- (that column has an FK to cleans.id). A BEFORE INSERT trigger causes an
-- FK-violation because the clean row doesn't exist yet at that point.

DROP TRIGGER IF EXISTS attach_pending_cleaner_notes_trigger ON cleans;
DROP FUNCTION IF EXISTS attach_pending_cleaner_notes();

CREATE OR REPLACE FUNCTION attach_pending_cleaner_notes()
RETURNS TRIGGER AS $func$
DECLARE
  v_pending_notes TEXT;
BEGIN
  SELECT STRING_AGG(
    '- ' || COALESCE(title, '') || ': ' || COALESCE(content, ''),
    E'\n'
  ) INTO v_pending_notes
  FROM pending_cleaner_notes
  WHERE property_id = NEW.property_id
    AND attached_to_clean_id IS NULL;

  IF v_pending_notes IS NOT NULL THEN
    UPDATE cleans
       SET admin_note = COALESCE(admin_note, '') ||
                        CASE WHEN admin_note IS NOT NULL AND admin_note <> ''
                             THEN E'\n---\n' ELSE '' END ||
                        v_pending_notes
     WHERE id = NEW.id;

    UPDATE pending_cleaner_notes
       SET attached_to_clean_id = NEW.id,
           attached_at = NOW()
     WHERE property_id = NEW.property_id
       AND attached_to_clean_id IS NULL;
  END IF;

  RETURN NULL; -- ignored for AFTER triggers
END;
$func$ LANGUAGE plpgsql;

CREATE TRIGGER attach_pending_cleaner_notes_trigger
AFTER INSERT ON cleans
FOR EACH ROW
EXECUTE FUNCTION attach_pending_cleaner_notes();
