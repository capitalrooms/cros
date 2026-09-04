-- Migration 122: Phase 2 — Message Template Content Migration
-- Adds a slug column (used by route code), populates all 23 editable
-- templates with real subject_line + template_text, and flips is_hardcoded
-- to false so the Message Templates screen shows them as editable.
--
-- The 2 Quick Notify entries (free-text) are excluded.
-- The 2 Applicant Offer entries and Landlord Acquisition use lib/*.ts files
-- and have their subject lines updated but bodies left for those files.
--
-- PASTE INTO SUPABASE SQL EDITOR — no em-dashes or smart quotes.

-- 1. Add slug column (programmatic key used by route code)
ALTER TABLE notification_templates
  ADD COLUMN IF NOT EXISTS slug VARCHAR(100);

CREATE INDEX IF NOT EXISTS idx_notification_templates_slug
  ON notification_templates(slug)
  WHERE slug IS NOT NULL;

-- 2. Assign slugs to all system message rows
UPDATE notification_templates SET slug = 'maintenance-tenant-receipt'
  WHERE is_system_message = true AND name ILIKE '%Job Raised%Tenant Receipt%';

UPDATE notification_templates SET slug = 'maintenance-admin-alert'
  WHERE is_system_message = true AND name ILIKE '%Job Raised%Admin Alert%';

UPDATE notification_templates SET slug = 'maintenance-contractor-assignment'
  WHERE is_system_message = true AND name ILIKE '%Job Raised%Contractor%';

UPDATE notification_templates SET slug = 'repair-booked-all'
  WHERE is_system_message = true AND name ILIKE '%Job Booking Confirmation%';

UPDATE notification_templates SET slug = 'job-held-tenant'
  WHERE is_system_message = true AND name ILIKE '%Job Held for Batching%';

UPDATE notification_templates SET slug = 'job-completed-all'
  WHERE is_system_message = true AND name ILIKE '%Job Completed%';

UPDATE notification_templates SET slug = 'contractor-room-access'
  WHERE is_system_message = true AND name ILIKE '%Room Access Notice%';

UPDATE notification_templates SET slug = 'contractor-nudge'
  WHERE is_system_message = true AND name ILIKE '%Daily%Nudge%';

UPDATE notification_templates SET slug = 'viewing-all-recipients'
  WHERE is_system_message = true AND name ILIKE '%Viewing Scheduled%Notifications%';

UPDATE notification_templates SET slug = 'appointment-viewing-tenants'
  WHERE is_system_message = true AND name ILIKE '%Appointment Scheduled%';

UPDATE notification_templates SET slug = 'applicant-offer-letter'
  WHERE is_system_message = true AND name ILIKE '%Applicant Offer%Apply Link%';

UPDATE notification_templates SET slug = 'applicant-offer-deposit'
  WHERE is_system_message = true AND name ILIKE '%Search Is Over%';

UPDATE notification_templates SET slug = 'let-only-contact-notice'
  WHERE is_system_message = true AND name ILIKE '%Let-Only Viewing%';

UPDATE notification_templates SET slug = 'viewing-confirmation-sms'
  WHERE is_system_message = true AND name ILIKE '%Viewing Confirmation SMS%';

UPDATE notification_templates SET slug = 'tenant-portal-invite'
  WHERE is_system_message = true AND name ILIKE '%Tenant Portal Invite%';

UPDATE notification_templates SET slug = 'landlord-portal-invite'
  WHERE is_system_message = true AND name ILIKE '%Landlord Portal Invite%';

UPDATE notification_templates SET slug = 'landlord-onboarding-welcome'
  WHERE is_system_message = true AND name ILIKE '%Landlord Onboarding%Welcome%';

UPDATE notification_templates SET slug = 'landlord-onboarding-approved'
  WHERE is_system_message = true AND name ILIKE '%Landlord Onboarding%Verification%';

UPDATE notification_templates SET slug = 'landlord-aml-reverification'
  WHERE is_system_message = true AND name ILIKE '%AML Re-verification%';

UPDATE notification_templates SET slug = 'landlord-acquisition-pitch'
  WHERE is_system_message = true AND name ILIKE '%Landlord Acquisition Pitch%';

UPDATE notification_templates SET slug = 'quick-notify-tenant-cleaner'
  WHERE is_system_message = true AND name ILIKE '%Quick Notify%Tenant%Cleaner%';

UPDATE notification_templates SET slug = 'quick-notify-lettings'
  WHERE is_system_message = true AND name ILIKE '%Quick Notify%Lettings%';

UPDATE notification_templates SET slug = 'checkout-tenant-notice'
  WHERE is_system_message = true AND name ILIKE '%Checkout%Tenant Notice%';

UPDATE notification_templates SET slug = 'checkout-cleaner-headsup'
  WHERE is_system_message = true AND name ILIKE '%Checkout%Cleaner%';

UPDATE notification_templates SET slug = 'staff-calendar-invite'
  WHERE is_system_message = true AND name ILIKE '%Calendar ICS%';

-- 3. Populate real template content + flip is_hardcoded = false
--    Variables use {{var_name}} syntax. Routes call render(template, vars).
--    template_text = what goes inside emailHtml() for email routes,
--                    or the plain message text for SMS/push routes.


-- ── Maintenance / Repairs ────────────────────────────────────────────────────

UPDATE notification_templates SET
  is_hardcoded = false,
  subject_line = 'Request received -- {{heading}}',
  template_text = '<h2 style="margin:0 0 18px;font-size:22px">We received your request</h2>
<p style="margin:0 0 30px;font-size:18px;font-weight:600;line-height:1.5">{{heading}}</p>
<table style="width:100%;border-collapse:collapse;font-size:14px">
  <tr><td style="padding:6px 0;color:#78716c;width:110px">What</td>
      <td style="padding:6px 0;font-weight:600">{{ticket_title}}</td></tr>
  <tr><td style="padding:6px 0;color:#78716c">Where</td>
      <td style="padding:6px 0">{{where}}</td></tr>
  <tr><td style="padding:6px 0;color:#78716c">Priority</td>
      <td style="padding:6px 0">{{priority}}</td></tr>
  <tr><td style="padding:6px 0;color:#78716c">Status</td>
      <td style="padding:6px 0"><strong>Awaiting review</strong></td></tr>
</table>
<p style="margin-top:20px;padding:12px;background:#fafaf9;border-radius:8px;font-size:14px;color:#78716c">
  Your request has been submitted and is now waiting for our team to review and schedule.
  You''ll get an email as soon as a time is arranged.
</p>'
WHERE slug = 'maintenance-tenant-receipt';


UPDATE notification_templates SET
  is_hardcoded = false,
  subject_line = 'New request -- {{heading}}',
  template_text = '<h2 style="margin:0 0 18px;font-size:22px">New maintenance request</h2>
<p style="margin:0 0 30px;font-size:18px;font-weight:600;line-height:1.5">{{heading}}</p>
<table style="width:100%;border-collapse:collapse;font-size:14px">
  <tr><td style="padding:6px 0;color:#78716c;width:110px">Reported by</td>
      <td style="padding:6px 0;font-weight:600">{{reporter_email}}</td></tr>
  <tr><td style="padding:6px 0;color:#78716c">Where</td>
      <td style="padding:6px 0">{{where}}</td></tr>
  <tr><td style="padding:6px 0;color:#78716c">Priority</td>
      <td style="padding:6px 0">{{priority}}</td></tr>
  <tr><td style="padding:6px 0;color:#78716c">Description</td>
      <td style="padding:6px 0">{{description}}</td></tr>
</table>
<p style="margin-top:20px"><strong>Action needed:</strong> Review and approve this request, then assign to a contractor.</p>'
WHERE slug = 'maintenance-admin-alert';


UPDATE notification_templates SET
  is_hardcoded = false,
  subject_line = 'New job assigned -- {{heading}}',
  template_text = '<h2 style="margin:0 0 8px;font-size:22px">Hi {{contractor_name}}, you''ve been assigned a job</h2>
<p style="margin:0 0 24px;font-size:18px;font-weight:600;line-height:1.5">{{heading}}</p>
<table style="width:100%;border-collapse:collapse;font-size:14px">
  <tr><td style="padding:6px 0;color:#78716c;width:110px">Job</td>
      <td style="padding:6px 0;font-weight:600">{{ticket_title}}</td></tr>
  <tr><td style="padding:6px 0;color:#78716c">Property</td>
      <td style="padding:6px 0">{{property_name}}</td></tr>
  <tr><td style="padding:6px 0;color:#78716c">Address</td>
      <td style="padding:6px 0">{{property_address}}</td></tr>
  <tr><td style="padding:6px 0;color:#78716c">Room</td>
      <td style="padding:6px 0">{{room_name}}</td></tr>
  <tr><td style="padding:6px 0;color:#78716c">Priority</td>
      <td style="padding:6px 0">{{priority}}</td></tr>
</table>
<p style="margin-top:20px;padding:12px;background:#fafaf9;border-radius:8px;font-size:14px;color:#78716c">
  Please log in to the contractor portal to confirm you''ve received this job and book a date to attend.
</p>
<p style="margin-top:8px;font-size:13px;color:#78716c">SMS also sent: Hi {{contractor_name}}, new job from Capital Rooms: {{ticket_title}} at {{property_address}}. Reply Y to confirm you''ll attend, or N if you have a scheduling issue. Portal: {{portal_url}}/contractor/jobs -- Capital Rms</p>'
WHERE slug = 'maintenance-contractor-assignment';


UPDATE notification_templates SET
  is_hardcoded = false,
  subject_line = 'Repair booked -- {{heading}} -- {{when}}',
  template_text = '<h2 style="margin:0 0 18px;font-size:22px">Repair booked</h2>
<p style="margin:0 0 30px;font-size:18px;font-weight:600;line-height:1.5">{{heading}}</p>
<table style="width:100%;border-collapse:collapse;font-size:14px">
  <tr><td style="padding:6px 0;color:#78716c;width:110px">When</td>
      <td style="padding:6px 0;font-weight:600">{{when}}</td></tr>
  <tr><td style="padding:6px 0;color:#78716c">Attending</td>
      <td style="padding:6px 0;font-weight:600">{{attending}}</td></tr>
  <tr><td style="padding:6px 0;color:#78716c">Where</td>
      <td style="padding:6px 0">{{where}}</td></tr>
  <tr><td style="padding:6px 0;color:#78716c">Priority</td>
      <td style="padding:6px 0">{{priority}}</td></tr>
</table>
<p style="margin-top:20px;padding:12px;background:#fafaf9;border-radius:8px;font-size:14px">
  <span style="color:#78716c">Reported by tenant:</span><br>{{ticket_title}}
</p>
<p style="color:#78716c;font-size:13px">Contractor email: Job confirmed -- {{heading}} -- {{when}}. Body: Hi {{contractor_name}}, when: {{when}}, address: {{where}}, directions link included.</p>
<p style="color:#78716c;font-size:13px">Landlord email: Repair scheduled at {{property_name}} -- when: {{when}}.</p>'
WHERE slug = 'repair-booked-all';


UPDATE notification_templates SET
  is_hardcoded = false,
  subject_line = 'We''ve logged your {{category}} report',
  template_text = '<h2 style="margin:0 0 14px;font-size:20px;color:#1c1917;font-weight:700;">Thanks for reporting this</h2>
<p style="margin:0 0 20px;font-size:16px;font-weight:600;color:#1c1917;line-height:1.4;">
  {{category}} -- {{room_name}}
</p>
<p style="font-size:15px;line-height:1.6;color:#1c1917;margin:0 0 12px;">
  We''ve logged this. It''s a smaller job that can sensibly be done at the same
  time as other work, so we''re holding it until there''s more to do at your
  property -- that way you''re disrupted once rather than several times.
</p>
<p style="font-size:15px;line-height:1.6;color:#1c1917;margin:0 0 12px;">
  <strong>You''ll be given a date and arrival time as soon as it''s booked in.</strong>
</p>
<p style="font-size:14px;color:#78716c;margin:0 0 24px;">
  If this becomes urgent in the meantime, report it again and tell us it''s got worse.
</p>'
WHERE slug = 'job-held-tenant';


UPDATE notification_templates SET
  is_hardcoded = false,
  subject_line = 'Repair completed -- {{category}} at {{property_name}}',
  template_text = '<h2 style="margin:0 0 18px;font-size:22px">Repair completed</h2>
<p style="margin:0 0 30px;font-size:18px;font-weight:600;line-height:1.5">{{category}}</p>
<table style="width:100%;border-collapse:collapse;font-size:14px">
  <tr><td style="padding:6px 0;color:#78716c;width:110px">Where</td>
      <td style="padding:6px 0">{{where}}</td></tr>
  <tr><td style="padding:6px 0;color:#78716c">Status</td>
      <td style="padding:6px 0"><strong>Completed</strong></td></tr>
</table>
<p style="margin-top:20px;padding:12px;background:#fafaf9;border-radius:8px;font-size:14px;color:#78716c">
  The contractor has marked this job complete. Check the portal for photos and notes.
</p>
<p style="margin-top:12px;font-size:13px;color:#78716c">Tenant in room subject: Your repair is complete -- {{category}}. Other tenants subject: Maintenance completed at your property -- {{category}}.</p>'
WHERE slug = 'job-completed-all';


UPDATE notification_templates SET
  is_hardcoded = false,
  subject_line = 'Contractor accessing your room -- {{date_str}}',
  template_text = 'A contractor will need access to your room at {{property_name}} on {{when}}. Work: {{ticket_title}}. Please make sure your room is accessible and any valuables are stored safely.'
WHERE slug = 'contractor-room-access';


UPDATE notification_templates SET
  is_hardcoded = false,
  subject_line = null,
  template_text = 'Your {{slot}} job today -- tap to confirm you''re on track, or reschedule.'
WHERE slug = 'contractor-nudge';


-- ── Viewings / Lettings ──────────────────────────────────────────────────────

UPDATE notification_templates SET
  is_hardcoded = false,
  subject_line = 'Viewing scheduled -- {{room_name}} at {{property_name}}',
  template_text = '<h2 style="margin:0 0 18px;font-size:22px">Viewing scheduled</h2>
<p style="margin:0 0 30px;font-size:18px;font-weight:600;line-height:1.5">{{room_name}}</p>
<table style="width:100%;border-collapse:collapse;font-size:14px">
  <tr><td style="padding:6px 0;color:#78716c;width:110px">When</td>
      <td style="padding:6px 0;font-weight:600">{{when}}</td></tr>
  <tr><td style="padding:6px 0;color:#78716c">Where</td>
      <td style="padding:6px 0">{{property_name_address}}</td></tr>
  <tr><td style="padding:6px 0;color:#78716c">Visitor</td>
      <td style="padding:6px 0">{{visitor_name}} {{visitor_email_suffix}}</td></tr>
</table>
<p style="margin-top:12px;font-size:13px;color:#78716c">Room tenant subject: A viewing has been booked on your room -- {{room_name}}. Other tenants subject: A viewing is booked at the house -- {{property_name}}.</p>
<p style="margin-top:8px;font-size:13px;color:#78716c">Applicant SMS: Hi {{visitor_first_name}}, your viewing of {{room_name}} at {{address}} is confirmed for {{when}}. Reply Y to confirm you''re coming, or N if you''re running late. -- Capital Rms</p>'
WHERE slug = 'viewing-all-recipients';


UPDATE notification_templates SET
  is_hardcoded = false,
  subject_line = 'A viewing has been booked for your room -- {{room_name}}',
  template_text = '<h2 style="margin:0 0 18px;font-size:22px">Viewing Scheduled</h2>
<p style="margin:0 0 12px;font-size:16px">Hi {{tenant_name}},</p>
<p style="margin:0 0 20px;line-height:1.6">A viewing has been booked {{room_or_at_property}}.</p>
<div style="background:#f3f1ef;padding:16px;border-radius:8px;margin:20px 0">
  <table style="width:100%;border-collapse:collapse;font-size:14px">
    <tr><td style="padding:6px 0;color:#78716c;width:100px">When</td>
        <td style="padding:6px 0;font-weight:600">{{when}}</td></tr>
    <tr><td style="padding:6px 0;color:#78716c">Room</td>
        <td style="padding:6px 0;font-weight:600">{{room_name}}</td></tr>
    <tr><td style="padding:6px 0;color:#78716c">Property</td>
        <td style="padding:6px 0">{{property_name}}</td></tr>
  </table>
</div>
<p style="margin:0;color:#78716c;font-size:14px">Please keep your shared areas tidy during this time. Thank you!</p>'
WHERE slug = 'appointment-viewing-tenants';


UPDATE notification_templates SET
  is_hardcoded = false,
  subject_line = 'Hi {{visitor_first_name}}, your viewing of {{room_name}} at {{address}} is confirmed for {{when}}.',
  template_text = 'Hi {{visitor_first_name}}, your viewing of {{room_name}} at {{address}} is confirmed for {{when}}. Reply Y to confirm you''re coming, or N if you''re running late. -- Capital Rms'
WHERE slug = 'viewing-confirmation-sms';


UPDATE notification_templates SET
  is_hardcoded = false,
  subject_line = '{{event_subject}} -- {{address}}',
  template_text = 'Hi {{contact_name}}, {{event_intro}}

We will have a management set of keys for access -- you do not need to be present. Thank you for your hospitality whilst we visit and we hope not to disturb you for too long.

If you have any questions, please contact {{sender_name}} at Capital Rooms.

Capital Rooms'
WHERE slug = 'let-only-contact-notice';


-- ── Onboarding / Account Access ──────────────────────────────────────────────

UPDATE notification_templates SET
  is_hardcoded = false,
  subject_line = 'Welcome to Capital Rooms -- your tenant portal is ready',
  template_text = 'Dear {{first_name}},

We are delighted to welcome you to Capital Rooms. Your tenancy is now set up on our management platform -- please use the button below to access your tenant portal.

Property: {{property_address}}
Room: {{room_name}}
Start date: {{start_date}}
Monthly rent: {{monthly_rent}}

Through your tenant portal you can track repairs, view upcoming visits, read messages from your property manager, and check your tenancy documents -- all in one place.

Sign in: {{sign_in_link}}
Your login: {{email}}

Add to your home screen: Capital Rooms works as an app on your phone -- no download required. Once signed in, tap Share -> "Add to Home Screen" on iPhone, or use the Chrome menu on Android.

Kind regards,
Capital Rooms Management
management@capitalrooms.co.uk'
WHERE slug = 'tenant-portal-invite';


UPDATE notification_templates SET
  is_hardcoded = false,
  subject_line = 'Welcome to Capital Rooms -- your landlord portal is ready',
  template_text = 'Dear {{first_name}},

Welcome to Capital Rooms. Your landlord portal is now live -- use the button below to access your account, view financial statements, and manage your properties.

Through your portal you can view monthly statements, track maintenance jobs, review compliance certificates, and approve large works -- all in one place.

Sign in: {{sign_in_link}}
Your login: {{email}}

Add to your home screen: Capital Rooms works as an app -- no download required. Once signed in on iPhone, tap Share -> "Add to Home Screen". On Android, use the Chrome menu -> "Add to Home Screen".

Kind regards,
Capital Rooms Management
management@capitalrooms.co.uk'
WHERE slug = 'landlord-portal-invite';


-- Landlord onboarding -- subject lines editable; body stays in route code
UPDATE notification_templates SET
  is_hardcoded = false,
  subject_line = 'Welcome to Capital Rooms -- next steps',
  template_text = 'Hi {{first_name}}, welcome to Capital Rooms. Please complete the steps below to finish setting up your landlord account.'
WHERE slug = 'landlord-onboarding-welcome';

UPDATE notification_templates SET
  is_hardcoded = false,
  subject_line = 'Your verification is complete -- Capital Rooms',
  template_text = 'Hi {{first_name}}, your identity verification is complete. Your landlord account is now fully active.'
WHERE slug = 'landlord-onboarding-approved';

UPDATE notification_templates SET
  is_hardcoded = false,
  subject_line = 'Action required -- re-verify your identity',
  template_text = 'Hi {{first_name}}, we need you to re-verify your identity as part of our ongoing compliance obligations. Please use the link below to complete the process.'
WHERE slug = 'landlord-aml-reverification';


-- ── Move-Out / Checkout ──────────────────────────────────────────────────────

UPDATE notification_templates SET
  is_hardcoded = false,
  subject_line = 'Your notice period has been recorded -- Capital Rooms',
  template_text = 'We have received your notice to end your tenancy. Your move-out date is {{move_out_date}}. We will be in touch to arrange the checkout process.'
WHERE slug = 'checkout-tenant-notice';

UPDATE notification_templates SET
  is_hardcoded = false,
  subject_line = 'Move-out coming up -- {{room_name}} at {{property_address}}',
  template_text = 'Hi {{cleaner_name}},

A room under our management will need cleaning after the current tenant moves out.

Room: {{room_name}}
Property: {{property_address}}
Tenant moves out: {{move_out_date}}
Target clean date: {{clean_date}}

Please confirm your availability and let us know your proposed cleaning date.

Capital Rooms'
WHERE slug = 'checkout-cleaner-headsup';


-- ── Staff Calendar ────────────────────────────────────────────────────────────

UPDATE notification_templates SET
  is_hardcoded = false,
  subject_line = 'Appointment -- {{title}} -- {{when}}',
  template_text = '{{title}}
{{when}}
Location: {{location}}

{{description}}

Open the attached invite to add this to your calendar.'
WHERE slug = 'staff-calendar-invite';


-- ── New Business (subject only -- body lives in lib/email-templates/) ─────────

UPDATE notification_templates SET
  is_hardcoded = false,
  subject_line = 'Let us make property simple, {{first_name}}.'
WHERE slug = 'landlord-acquisition-pitch';


-- Leave Quick Notify rows as is_hardcoded = true (free-text, no template)
-- 'quick-notify-tenant-cleaner' and 'quick-notify-lettings' stay unchanged.
