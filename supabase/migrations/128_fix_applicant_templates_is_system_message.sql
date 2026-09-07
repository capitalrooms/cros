-- Migration 128: Mark applicant email templates as system messages
-- getTemplate() in lib/messageTemplate.ts requires is_system_message = true.
-- Migration 126 set is_hardcoded = false but forgot this flag, so the fallback
-- inline HTML was used instead of the DB templates.

UPDATE notification_templates
SET
  is_system_message = true,
  updated_at        = NOW()
WHERE slug IN ('applicant-offer-letter', 'applicant-offer-deposit');
