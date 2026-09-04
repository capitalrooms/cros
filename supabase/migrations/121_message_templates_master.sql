-- Migration 121: Extend notification_templates for master message template screen
-- Adds system-message fields alongside existing Quick Notify fields.
-- All changes are additive — Quick Notify continues to work unchanged.

ALTER TABLE notification_templates
  ADD COLUMN IF NOT EXISTS trigger_description TEXT,
  ADD COLUMN IF NOT EXISTS recipient_description TEXT,
  ADD COLUMN IF NOT EXISTS channels TEXT[] DEFAULT ARRAY['email'],
  ADD COLUMN IF NOT EXISTS group_name VARCHAR(100),
  ADD COLUMN IF NOT EXISTS is_hardcoded BOOLEAN DEFAULT true,
  ADD COLUMN IF NOT EXISTS route_path TEXT,
  ADD COLUMN IF NOT EXISTS sort_order INT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS is_system_message BOOLEAN DEFAULT false;

-- Index for the new master-screen query
CREATE INDEX IF NOT EXISTS idx_notification_templates_system ON notification_templates(is_system_message, group_name, sort_order);

-- ─────────────────────────────────────────────────────────────────────────────
-- Seed the 24 system message types found in the codebase audit (Sep 2026)
-- is_system_message = true marks these as system routes (not Quick Notify templates)
-- is_hardcoded = true means content still lives in the route file (Phase 2 will migrate)
-- ─────────────────────────────────────────────────────────────────────────────

INSERT INTO notification_templates
  (name, category, group_name, sort_order, trigger_description, recipient_description, channels,
   is_system_message, is_hardcoded, route_path, subject_line, template_text)
VALUES

-- ── Group 1: Maintenance / Repairs ──────────────────────────────────────────
(
  'Job Raised — Tenant Receipt',
  'maintenance', 'Maintenance / Repairs', 10,
  'Tenant submits a maintenance job via the portal',
  'Tenant who submitted the job',
  ARRAY['email'],
  true, true, '/api/notify-job-raised',
  'We''ve received your maintenance request',
  'Content lives in route file — migrate in Phase 2.'
),
(
  'Job Raised — Admin Alert',
  'maintenance', 'Maintenance / Repairs', 11,
  'Tenant submits a maintenance job via the portal',
  'Admin team',
  ARRAY['email'],
  true, true, '/api/notify-job-raised',
  'New maintenance job submitted',
  'Content lives in route file — migrate in Phase 2.'
),
(
  'Job Raised — Contractor Assignment',
  'maintenance', 'Maintenance / Repairs', 12,
  'Admin assigns a contractor to a job',
  'Contractor (email + SMS Y/N confirmation)',
  ARRAY['email', 'sms'],
  true, true, '/api/notify-job-raised',
  'New job from Capital Rooms',
  'Hi {name}, new job from Capital Rooms: {title} at {address}. Reply Y to confirm or N to decline.'
),
(
  'Job Booking Confirmation',
  'maintenance', 'Maintenance / Repairs', 20,
  'Admin books a visit date for a job',
  'Admin (ICS), Contractor (ICS + directions), Landlord (opt-in, no contractor name)',
  ARRAY['email'],
  true, true, '/api/notify-booking',
  'Repair booked — {date}',
  'Content lives in route file — migrate in Phase 2.'
),
(
  'Job Held for Batching',
  'maintenance', 'Maintenance / Repairs', 30,
  'Admin holds a job to batch it with other small jobs',
  'Tenant who reported the job',
  ARRAY['email'],
  true, true, '/api/notify-hold',
  'Your repair request — update',
  'Content lives in route file — migrate in Phase 2.'
),
(
  'Job Completed — Notification',
  'maintenance', 'Maintenance / Repairs', 40,
  'Contractor marks a job as complete',
  'Admin, tenant in affected room (opt-in), other tenants (opt-in)',
  ARRAY['email'],
  true, true, '/api/notify-job-completed',
  'Repair completed',
  'Content lives in route file — migrate in Phase 2.'
),
(
  'Room Access Notice',
  'maintenance', 'Maintenance / Repairs', 50,
  'Contractor is booked to work in a specific room',
  'Tenant in that specific room',
  ARRAY['in_app', 'push', 'email'],
  true, true, '/api/notify-room-access',
  'Contractor accessing your room',
  'Content lives in route file — migrate in Phase 2.'
),
(
  'Daily Contractor/Cleaner Nudge',
  'maintenance', 'Maintenance / Repairs', 60,
  'Daily cron job (9am) for staff with bookings today',
  'Contractor and cleaner staff with visits booked for today',
  ARRAY['push'],
  true, true, '/api/cron/nudge',
  null,
  'Still on time? You have a job booked today.'
),

-- ── Group 2: Viewings / Lettings ─────────────────────────────────────────────
(
  'Viewing Scheduled — Notifications',
  'lettings', 'Viewings / Lettings', 10,
  'Lettings team books a viewing for an available room',
  'Admin, tenant in that room (opt-in), other tenants (opt-in), applicant (SMS)',
  ARRAY['email', 'sms'],
  true, true, '/api/notify-viewing-scheduled',
  'Viewing confirmed',
  'Hi {name}, your viewing of {room} at {address} is confirmed for {date} at {time}.'
),
(
  'Appointment Scheduled — Tenant Notice',
  'lettings', 'Viewings / Lettings', 20,
  'Admin creates an appointment in the calendar',
  'Tenant in specific room (opt-in), other tenants at property (opt-in)',
  ARRAY['email'],
  true, true, '/api/notify-appointment-scheduled',
  'Upcoming visit to your property',
  'Content lives in route file — migrate in Phase 2.'
),
(
  'Applicant Offer — Apply Link',
  'lettings', 'Viewings / Lettings', 30,
  'Lettings team sends an offer to proceed with an application',
  'Applicant',
  ARRAY['email', 'sms'],
  true, false, '/api/lettings/send-offer',
  'Your offer from Capital Rooms',
  'Content lives in lib/emailTemplates.ts (buildOfferLetterEmail) — editable there.'
),
(
  'Applicant Offer — "The Search Is Over!"',
  'lettings', 'Viewings / Lettings', 31,
  'Lettings team sends a holding deposit request after offer accepted',
  'Applicant',
  ARRAY['email', 'sms'],
  true, false, '/api/lettings/send-offer',
  'The search is over — secure your room today',
  'Content lives in lib/emailTemplates.ts (buildSearchIsOverEmail) — editable there.'
),
(
  'Let-Only Viewing — Contact Notice',
  'lettings', 'Viewings / Lettings', 40,
  'Let-only viewing booked, rescheduled, or cancelled',
  'All contacts at the let-only listing (tenants, key holders)',
  ARRAY['email'],
  true, true, '/api/let-only/notify-contacts',
  'Viewing update for your property',
  'Content lives in route file — migrate in Phase 2.'
),
(
  'Viewing Confirmation SMS (Applicant)',
  'lettings', 'Viewings / Lettings', 50,
  'Viewing booked — confirmation sent to applicant phone',
  'Applicant (phone number)',
  ARRAY['sms'],
  true, true, '/api/sms/send-viewing-confirmation',
  null,
  '⚠️ Placeholder only — Twilio not yet connected to this route.'
),

-- ── Group 3: Onboarding / Account Access ─────────────────────────────────────
(
  'Tenant Portal Invite',
  'tenancy', 'Onboarding / Account Access', 10,
  'Admin clicks "Invite tenant" from the tenant card',
  'Tenant (magic link + welcome email with tenancy details)',
  ARRAY['email'],
  true, true, '/api/invite-tenant',
  'Welcome to Capital Rooms — your tenant portal is ready',
  'Content lives in route file — migrate in Phase 2.'
),
(
  'Landlord Portal Invite',
  'tenancy', 'Onboarding / Account Access', 20,
  'Admin invites a landlord to the portal',
  'Landlord (magic link + portal welcome)',
  ARRAY['email'],
  true, true, '/api/invite-landlord',
  'Welcome to Capital Rooms — your landlord portal is ready',
  'Content lives in route file — migrate in Phase 2.'
),
(
  'Landlord Onboarding — Welcome Pack',
  'tenancy', 'Onboarding / Account Access', 30,
  'Admin creates a new landlord onboarding record',
  'Prospective landlord (welcome pack with AML form link)',
  ARRAY['email'],
  true, true, '/api/landlord-onboarding',
  'Welcome to Capital Rooms — next steps',
  'Content lives in route file — migrate in Phase 2.'
),
(
  'Landlord Onboarding — Verification Approved',
  'tenancy', 'Onboarding / Account Access', 31,
  'Admin advances landlord onboarding to stage 4 (approved)',
  'Landlord',
  ARRAY['email'],
  true, true, '/api/landlord-onboarding/[id]',
  'Your verification is complete',
  'Content lives in route file — migrate in Phase 2.'
),
(
  'Landlord AML Re-verification',
  'tenancy', 'Onboarding / Account Access', 40,
  'Admin requests AML refresh from existing landlord',
  'Existing landlord',
  ARRAY['email'],
  true, true, '/api/landlord-aml-refresh',
  'Action required — re-verify your identity',
  'Content lives in route file — migrate in Phase 2.'
),

-- ── Group 4: New Business / Acquisition ──────────────────────────────────────
(
  'Landlord Acquisition Pitch',
  'community', 'New Business / Acquisition', 10,
  'Admin sends an acquisition email to a prospective landlord',
  'Prospective landlord',
  ARRAY['email'],
  true, false, '/api/landlord-acquisition',
  'Property management with Capital Rooms',
  'Content lives in lib/email-templates/acquisition.ts — editable there.'
),

-- ── Group 5: Ad-Hoc / Quick Notify ───────────────────────────────────────────
(
  'Quick Notify — Tenant / Cleaner',
  'community', 'Ad-Hoc / Quick Notify', 10,
  'Admin sends a Quick Notify message from the property or notify page',
  'Selected tenants, all tenants, room tenants, or cleaners',
  ARRAY['in_app', 'push', 'email'],
  true, false, '/api/admin/quick-notify',
  null,
  'Free text or template — message composed by admin at send time.'
),
(
  'Quick Notify — Lettings',
  'lettings', 'Ad-Hoc / Quick Notify', 20,
  'Admin sends a lettings-specific Quick Notify from a property',
  'Property tenants (lettings announcements)',
  ARRAY['in_app', 'push', 'email'],
  true, false, '/api/admin/quick-notify-lettings',
  null,
  'Free text or template — message composed by admin at send time.'
),

-- ── Group 6: Move-Out / Checkout ─────────────────────────────────────────────
(
  'Checkout — Tenant Notice',
  'tenancy', 'Move-Out / Checkout', 10,
  'Admin marks a tenancy as on notice',
  'Tenant (notice confirmation)',
  ARRAY['email'],
  true, true, '/api/tenancies/set-on-notice',
  'Your notice period has been recorded',
  '⚠️ Route exists but Resend not yet wired — currently console.log only. Activate in Phase 2.'
),
(
  'Checkout — Cleaner Heads-Up',
  'maintenance', 'Move-Out / Checkout', 20,
  'Admin marks a tenancy as on notice',
  'Cleaner assigned to the property',
  ARRAY['email'],
  true, true, '/api/tenancies/set-on-notice',
  'Move-out coming up',
  '⚠️ Route exists but Resend not yet wired — currently console.log only. Activate in Phase 2.'
),

-- ── Group 7: Staff Calendar ───────────────────────────────────────────────────
(
  'Calendar ICS Invite',
  'maintenance', 'Staff Calendar', 10,
  'Staff member books a viewing or appointment via the calendar',
  'The staff member themselves (ICS file for their calendar app)',
  ARRAY['email'],
  true, true, '/api/calendar/invite',
  'Appointment — {date}',
  'Content lives in route file — migrate in Phase 2.'
)

ON CONFLICT (name) DO UPDATE SET
  group_name         = EXCLUDED.group_name,
  sort_order         = EXCLUDED.sort_order,
  trigger_description = EXCLUDED.trigger_description,
  recipient_description = EXCLUDED.recipient_description,
  channels           = EXCLUDED.channels,
  is_system_message  = EXCLUDED.is_system_message,
  is_hardcoded       = EXCLUDED.is_hardcoded,
  route_path         = EXCLUDED.route_path,
  subject_line       = COALESCE(EXCLUDED.subject_line, notification_templates.subject_line),
  template_text      = COALESCE(EXCLUDED.template_text, notification_templates.template_text);
