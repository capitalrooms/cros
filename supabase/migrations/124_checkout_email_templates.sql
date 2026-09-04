-- Migration 124: Checkout email sequence templates
-- Two steps: immediate notice confirmation + 2-week reminder.
-- Wording is DRAFT — needs admin review before going live.
-- Edit via Admin → Message Templates.

INSERT INTO notification_templates (
  slug, group_name, is_hardcoded, is_system_message,
  subject_line, template_text, channels, route_path, sort_order
) VALUES

-- Step 1: sent immediately when notice is confirmed -------------------------
(
  'checkout-notice-confirmed',
  'Move-Out / Checkout',
  false,
  true,
  'Your notice has been received — {{move_out_date}} move-out confirmed',
  '<h2 style="margin:0 0 18px;font-size:22px">Notice received</h2>
<p style="margin:0 0 16px;font-size:16px">Hi {{tenant_name}},</p>
<p style="margin:0 0 16px;line-height:1.6">
  Thank you for letting us know. We have recorded your notice to leave on
  <strong>{{move_out_date}}</strong>.
</p>

<table style="width:100%;border-collapse:collapse;font-size:14px;margin:0 0 24px">
  <tr>
    <td style="padding:8px 0;color:#78716c;width:160px">Move-out date</td>
    <td style="padding:8px 0;font-weight:600">{{move_out_date}}</td>
  </tr>
  <tr>
    <td style="padding:8px 0;color:#78716c">Notice received</td>
    <td style="padding:8px 0">{{notice_received_date}}</td>
  </tr>
  <tr>
    <td style="padding:8px 0;color:#78716c">Room</td>
    <td style="padding:8px 0">{{room_name}}, {{property_address}}</td>
  </tr>
  <tr>
    <td style="padding:8px 0;color:#78716c">Monthly rent</td>
    <td style="padding:8px 0">£{{monthly_rent}}</td>
  </tr>
  <tr style="border-top:2px solid #e5e5e5">
    <td style="padding:10px 0;font-weight:700">Final rent due</td>
    <td style="padding:10px 0;font-weight:700">£{{pro_rata_amount}} ({{pro_rata_days}} days of {{days_in_month}})</td>
  </tr>
</table>

<h3 style="margin:0 0 12px;font-size:16px">Checkout checklist</h3>
<ul style="margin:0 0 24px;padding-left:20px;line-height:1.8;font-size:14px">
  <li>Clear all personal belongings from your room and any communal storage</li>
  <li>Leave the room clean and in the condition it was when you moved in</li>
  <li>Return all keys to the office or key safe by midday on your move-out date</li>
  <li>Cancel any direct debits for rent from your move-out date</li>
  <li>Update your address with HMRC, banks, and any subscriptions</li>
  <li>Remove yourself from the electoral roll at your current address</li>
</ul>

<h3 style="margin:0 0 12px;font-size:16px">Deposit return</h3>
<p style="margin:0 0 16px;font-size:14px;line-height:1.6">
  Your deposit is held with the Deposit Protection Service.
  After you move out we will carry out an inspection and, provided there are no deductions,
  return your deposit within 10 working days. Any proposed deductions will be discussed
  with you before any action is taken.
</p>

<p style="margin:0 0 8px;font-size:14px">Any questions? Reply to this email or call us on <strong>{{contact_phone}}</strong>.</p>',
  ARRAY['email'],
  '/api/tenancies/set-on-notice',
  10
),

-- Step 2: sent 14 days before move-out ---------------------------------------
(
  'checkout-reminder-2weeks',
  'Move-Out / Checkout',
  false,
  true,
  'Reminder: your move-out is in 2 weeks — {{move_out_date}}',
  '<h2 style="margin:0 0 18px;font-size:22px">Moving out soon</h2>
<p style="margin:0 0 16px;font-size:16px">Hi {{tenant_name}},</p>
<p style="margin:0 0 16px;line-height:1.6">
  Just a reminder that your move-out date is coming up on <strong>{{move_out_date}}</strong> — two weeks from today.
</p>

<h3 style="margin:0 0 12px;font-size:16px">Checkout checklist</h3>
<ul style="margin:0 0 24px;padding-left:20px;line-height:1.8;font-size:14px">
  <li>Clear all personal belongings from your room and any communal storage</li>
  <li>Leave the room clean and in the condition it was when you moved in</li>
  <li>Return all keys to the office or key safe by midday on your move-out date</li>
  <li>Cancel any direct debits for rent from your move-out date</li>
  <li>Update your address with HMRC, banks, and any subscriptions</li>
  <li>Remove yourself from the electoral roll at your current address</li>
</ul>

<p style="margin:0 0 8px;font-size:14px">Any questions? Reply to this email or call us on <strong>{{contact_phone}}</strong>.</p>',
  ARRAY['email'],
  '/api/cron/checkout-reminder',
  20
)

ON CONFLICT (slug) DO UPDATE SET
  subject_line  = EXCLUDED.subject_line,
  template_text = EXCLUDED.template_text,
  group_name    = EXCLUDED.group_name,
  channels      = EXCLUDED.channels,
  route_path    = EXCLUDED.route_path,
  sort_order    = EXCLUDED.sort_order;
