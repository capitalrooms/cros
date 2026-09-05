-- Wire the two applicant email templates to actual editable HTML.
-- Sets is_hardcoded = false so routes can read from DB (with code fallback).
-- Tokens: {{first_name}}, {{room_name}}, {{property_address}},
--         {{apply_url}}, {{reserve_url}}, {{monthly_rent}}, {{weekly_rent}},
--         {{payment_ref}}

UPDATE notification_templates
SET
  is_hardcoded  = false,
  subject_line  = 'Your application for {{room_name}} at {{property_address}}',
  template_text = '<div style="font-family:sans-serif;max-width:560px;margin:0 auto;color:#1a1a1a">
  <div style="background:#1a1a1a;padding:24px 32px;border-radius:12px 12px 0 0;text-align:right">
    <img src="https://hwmwfmgqnjlogkfjnkwl.supabase.co/storage/v1/object/public/maintenance-photos/brand/logo.png"
         alt="Capital Rooms" height="36" style="display:inline-block" />
  </div>
  <div style="background:#ffffff;padding:32px;border:1px solid #e5e5e5;border-top:none;border-radius:0 0 12px 12px">
    <p style="font-size:16px;margin:0 0 16px">Hi {{first_name}},</p>
    <p style="font-size:15px;line-height:1.6;margin:0 0 16px;color:#444">
      Thanks for viewing <strong>{{room_name}}</strong>{{property_address_with_at}}.
      We''d love to invite you to submit a formal application — it takes less than 5 minutes.
    </p>
    <div style="text-align:center;margin:28px 0">
      <a href="{{apply_url}}"
         style="background:#1a1a1a;color:#ffffff;padding:14px 32px;border-radius:8px;
                text-decoration:none;font-size:15px;font-weight:600;display:inline-block">
        Apply Now →
      </a>
    </div>
    <p style="font-size:13px;color:#888;margin:0 0 4px">Or copy this link:</p>
    <p style="font-size:13px;color:#555;word-break:break-all;background:#f5f5f5;
              padding:10px 12px;border-radius:6px;margin:0">{{apply_url}}</p>
    <hr style="margin:28px 0;border:none;border-top:1px solid #e5e5e5" />
    <p style="font-size:12px;color:#999;margin:0;text-align:center">
      Capital Rooms · Innovating London living since 2018
    </p>
  </div>
</div>',
  updated_at    = NOW()
WHERE slug = 'applicant-offer-letter';


UPDATE notification_templates
SET
  is_hardcoded  = false,
  subject_line  = 'THE SEARCH IS OVER! — {{room_name}}, {{property_address}}',
  template_text = '<div style="font-family:sans-serif;max-width:580px;margin:0 auto;color:#1a1a1a">
  <div style="background:#1a1a1a;padding:24px 32px;border-radius:12px 12px 0 0;text-align:right">
    <img src="https://hwmwfmgqnjlogkfjnkwl.supabase.co/storage/v1/object/public/maintenance-photos/brand/logo.png"
         alt="Capital Rooms" height="36" style="display:inline-block" />
  </div>
  <div style="background:#ffffff;padding:32px;border:1px solid #e5e5e5;border-top:none;border-radius:0 0 12px 12px">
    <h1 style="font-size:22px;font-weight:700;margin:0 0 4px">THE SEARCH IS OVER! 🎉</h1>
    <p style="font-size:16px;margin:0 0 24px">Dear {{first_name}},</p>
    <p style="font-size:15px;line-height:1.6;margin:0 0 8px;color:#444">
      Thank you for your interest in our room at:
    </p>
    <div style="background:#f5f5f5;padding:16px 20px;border-radius:8px;margin:0 0 20px">
      <p style="font-size:16px;font-weight:700;margin:0 0 4px">{{room_name}}, {{property_address}}</p>
      <p style="font-size:15px;font-weight:600;color:#1a1a1a;margin:0">
        £{{monthly_rent}} pcm <span style="font-weight:400;color:#666">(all bills included)</span>
      </p>
    </div>
    <p style="font-size:14px;color:#444;margin:0 0 20px;line-height:1.6">
      This is with an intended 12-month term with a 5-week deposit.
    </p>
    <p style="font-size:14px;color:#444;margin:0 0 20px;line-height:1.6">
      If you would like to secure the room, we require a <strong>holding deposit</strong> to take it
      off the market. Don''t worry — this is deducted from your final balance and is not an extra fee.
    </p>
    <h2 style="font-size:16px;font-weight:700;margin:0 0 12px">How to secure it 💳</h2>
    <p style="font-size:14px;color:#444;margin:0 0 16px;line-height:1.6">
      The holding deposit is one week''s rent (<strong>£{{weekly_rent}}</strong>).
      Please make payment by bank transfer:
    </p>
    <table style="width:100%;border-collapse:collapse;margin:0 0 20px;font-size:14px">
      <tr>
        <td style="padding:8px 12px;background:#f9f9f9;font-weight:600;border-bottom:1px solid #eee;width:40%">Account Name</td>
        <td style="padding:8px 12px;border-bottom:1px solid #eee;font-family:monospace">Capital Rooms Ltd</td>
      </tr>
      <tr>
        <td style="padding:8px 12px;background:#f9f9f9;font-weight:600;border-bottom:1px solid #eee">Sort Code</td>
        <td style="padding:8px 12px;border-bottom:1px solid #eee;font-family:monospace">20-18-93</td>
      </tr>
      <tr>
        <td style="padding:8px 12px;background:#f9f9f9;font-weight:600;border-bottom:1px solid #eee">Account Number</td>
        <td style="padding:8px 12px;border-bottom:1px solid #eee;font-family:monospace">40162574</td>
      </tr>
      <tr>
        <td style="padding:8px 12px;background:#f9f9f9;font-weight:600;border-bottom:1px solid #eee">Payment Reference</td>
        <td style="padding:8px 12px;border-bottom:1px solid #eee;font-family:monospace">{{payment_ref}}</td>
      </tr>
      <tr>
        <td style="padding:8px 12px;background:#f9f9f9;font-weight:600;border-bottom:1px solid #eee">Amount</td>
        <td style="padding:8px 12px;border-bottom:1px solid #eee;font-family:monospace">£{{weekly_rent}}</td>
      </tr>
    </table>
    <p style="font-size:14px;color:#444;margin:0 0 20px;line-height:1.6">
      Once you''ve sent it, please let us know and send a quick screenshot of the confirmation.
      As soon as the payment is confirmed, we''ll take the room off the market and get you started
      with our online referencing provider, <strong>Homeppl</strong>.
    </p>
    <div style="text-align:center;margin:24px 0">
      <a href="{{reserve_url}}"
         style="background:#1a1a1a;color:#ffffff;padding:14px 32px;border-radius:8px;
                text-decoration:none;font-size:15px;font-weight:600;display:inline-block">
        View full reservation details →
      </a>
    </div>
    <p style="font-size:13px;color:#888;background:#fff8e6;border:1px solid #f0d070;padding:12px 16px;border-radius:8px;margin:0 0 20px;line-height:1.5">
      <strong>🌍 Paying from outside the UK?</strong> Please make sure your bank''s transfer fees are covered on your side.
    </p>
    <p style="font-size:13px;color:#888;border-top:1px solid #eee;padding-top:16px;line-height:1.5;margin:0">
      <strong>Important:</strong> The holding deposit is a non-refundable commitment to the room.
      However, if Capital Rooms or the landlord can no longer let the room to you, it will be returned to you in full.
    </p>
    <hr style="margin:24px 0;border:none;border-top:1px solid #e5e5e5" />
    <p style="font-size:12px;color:#999;margin:0;text-align:center">
      Capital Rooms · 0207 112 9163 · Innovating London living since 2018
    </p>
  </div>
</div>',
  updated_at    = NOW()
WHERE slug = 'applicant-offer-deposit';
