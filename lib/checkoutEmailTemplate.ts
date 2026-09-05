interface CheckoutEmailData {
  tenantName: string
  tenantEmail: string
  roomName: string
  propertyAddress: string
  moveOutDate: string
  lastRentAmount: number
  proRataRent: number
  proRataCalculation: string
  depositAmount?: number
  depositReturnInfo?: string
  cleaningNotes?: string
  contactEmail?: string
  contactPhone?: string
}

export function buildCheckoutEmail(data: CheckoutEmailData): string {
  const moveOutFormatted = new Date(data.moveOutDate).toLocaleDateString('en-GB', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })

  const contactEmail = data.contactEmail || 'management@capitalrooms.co.uk'
  const contactPhone = data.contactPhone || '0207 112 9163'

  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Sorry To See You Go - Capital Rooms</title>
  <style>
    body {
      font-family: 'Courier New', Courier, monospace;
      line-height: 1.6;
      color: #0a0a0a;
      background-color: #d6d5d1;
      margin: 0;
      padding: 0;
    }
    .email-outer {
      background: #d6d5d1;
      padding: 28px 16px 40px;
    }
    .email-wrap {
      max-width: 580px;
      margin: 0 auto;
      font-family: 'Courier New', Courier, monospace;
    }
    /* Header */
    .e-header {
      background: #0a0a0a;
      padding: 18px 28px;
      text-align: center;
    }
    .e-header span {
      font-size: 15px;
      font-weight: 700;
      letter-spacing: 0.14em;
      text-transform: uppercase;
      color: #FFE000;
      font-family: 'Courier New', Courier, monospace;
    }
    /* Hero */
    .e-hero {
      background: #d6d5d1;
      text-align: center;
      padding: 36px 32px 0;
      border-bottom: 3px solid #0a0a0a;
    }
    .e-hero h1 {
      font-size: 22px;
      font-weight: 900;
      letter-spacing: 0.02em;
      text-transform: uppercase;
      margin: 0 0 8px;
      font-family: 'Courier New', Courier, monospace;
    }
    .e-hero .sub {
      font-size: 15px;
      margin: 0 0 20px;
    }
    .yellow-block {
      background: #FFE000;
      margin: 0 -32px;
      padding: 28px 32px 32px;
      text-align: center;
    }
    .yellow-block .big {
      font-size: 52px;
      font-weight: 900;
      line-height: 1.05;
      letter-spacing: -0.02em;
    }
    /* Sections */
    .e-section {
      padding: 28px 32px;
      text-align: center;
      line-height: 1.75;
      border-bottom: 1px solid #b0afa9;
      font-size: 14px;
      color: #0a0a0a;
      background: #d6d5d1;
    }
    .e-section p + p { margin-top: 14px; }
    .amount-big {
      font-size: 32px;
      font-weight: 900;
      letter-spacing: -0.01em;
      margin: 10px 0 6px;
    }
    /* Steps */
    .steps-hdr {
      background: #0a0a0a;
      color: #FFE000;
      text-align: center;
      padding: 22px 32px;
    }
    .steps-hdr h2 {
      font-size: 20px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.04em;
      margin: 0;
      color: #FFE000;
    }
    .steps-intro {
      background: #f5f5f1;
      padding: 24px 32px;
      text-align: center;
      font-size: 14px;
      line-height: 1.7;
      border-bottom: 1px solid #ddd;
    }
    .steps-intro p + p { margin-top: 12px; }
    .step-item {
      background: #f5f5f1;
      padding: 20px 32px;
      border-bottom: 1px solid #e0dfda;
      font-size: 14px;
    }
    .step-item .icon { font-size: 24px; margin: 0 0 6px; }
    .step-item h3 {
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.04em;
      margin: 0 0 5px;
      font-size: 14px;
    }
    /* Voucher */
    .voucher {
      background: #FFE000;
      padding: 28px 32px;
      text-align: center;
      border-top: 3px solid #0a0a0a;
      border-bottom: 3px solid #0a0a0a;
      font-size: 13px;
      line-height: 1.7;
    }
    .voucher .icon { font-size: 28px; margin: 0 0 10px; }
    .voucher h2 {
      font-size: 16px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.04em;
      margin: 0 0 14px;
      line-height: 1.3;
    }
    .voucher p + p { margin-top: 10px; }
    /* Sign-off */
    .signoff {
      padding: 28px 32px;
      text-align: center;
      background: #d6d5d1;
      font-size: 14px;
      line-height: 1.75;
    }
    .signoff p + p { margin-top: 12px; }
    .signoff .brand {
      font-weight: 700;
      font-size: 17px;
      text-transform: uppercase;
      letter-spacing: 0.06em;
      margin-top: 18px;
    }
    /* Footer */
    .e-footer {
      background: #0a0a0a;
      color: #aaa;
      text-align: center;
      padding: 20px 28px;
      font-size: 11px;
      line-height: 1.9;
      letter-spacing: 0.03em;
    }
  </style>
</head>
<body>
  <div class="email-outer">
    <div class="email-wrap">

      <div class="e-header">
        <span>Capital Rooms</span>
      </div>

      <div class="e-hero">
        <h1>Sorry To See You Go!</h1>
        <p class="sub">It's the..</p>
        <div class="yellow-block">
          <div class="big">end<br>of<br>an<br>era.</div>
        </div>
      </div>

      <div class="e-section">
        <p>Dear ${data.tenantName},</p>
        <p>We are sorry to hear you are leaving us on <strong>${moveOutFormatted}</strong>.</p>
        <p>We hope you enjoyed your stay and wish you all the best in the future.</p>
      </div>

      <div class="e-section">
        <p>Just to confirm, your final rent payment is:</p>
        <p class="amount-big">£${data.proRataRent.toFixed(2)}</p>
      </div>

      <div class="e-section">
        <p>You are welcome to complete your departure on your own schedule. Just drop us an email to let us know when you have left the room and where in the room you have left the keys (e.g. top drawer of bedside table). Double check you have everything before you lock the front door!</p>
      </div>

      <div class="steps-hdr">
        <h2>3 Steps For A Speedy Deposit Refund</h2>
      </div>

      <div class="steps-intro">
        <p>It is our obligation to refund your deposit within 30 days of your tenancy end date. However, we know how useful it is to get this refunded sooner.</p>
        <p>If you follow the simple steps below, we will be able to refund your deposit within <strong>3 working days</strong> instead of 30!</p>
      </div>

      <div class="step-item">
        <p class="icon">📦</p>
        <h3>Take Your Stuff</h3>
        <p>Make sure you do a full sweep of the room; nothing should be left behind that requires removal after departure.</p>
      </div>

      <div class="step-item">
        <p class="icon">🧹</p>
        <h3>Hooooover!</h3>
        <p>Make sure you vacuum the room thoroughly. That includes inside, below, and behind all of the furniture too.</p>
      </div>

      <div class="step-item" style="border-bottom:none">
        <p class="icon">🏠</p>
        <h3>Love Thy Neighbour</h3>
        <p>Make sure you have not left any bits and pieces lying around in the communal areas or outside the property.</p>
      </div>

      <div class="voucher">
        <p class="icon">🎁</p>
        <h2>Find Your Own Replacement &amp; Earn a £75 Amazon Voucher!</h2>
        <p>If you're planning to move out, why not earn a <strong>£75 Amazon voucher?</strong> Simply find someone who passes our referencing checks to take over your room. If they successfully rent the room, we'll send you a <strong>£75 Amazon voucher</strong> as a thank you.</p>
        <p>To make it even easier, we're happy to arrange a dedicated viewing evening where you can show everyone around in one go. It's a great way to help secure your replacement quickly while earning yourself a reward.</p>
        <p><strong>Just let us know if you'd like to take part and we'll arrange the rest.</strong></p>
      </div>

      <div class="signoff">
        <p><strong>Finally..</strong></p>
        <p>We are wishing you the best for these final few weeks and hope that your move goes smoothly!</p>
        <p>If you have any questions or queries in relation to your check out just drop us an email and we will assist you.</p>
        <p>Best wishes,</p>
        <p class="brand">Capital Rooms</p>
      </div>

      <div class="e-footer">
        Capital Rooms<br>
        Third Floor | 86–90 Paul Street | London | EC2A 4NE<br>
        ${contactEmail} | ${contactPhone}
      </div>

    </div>
  </div>
</body>
</html>
  `.trim()
}
