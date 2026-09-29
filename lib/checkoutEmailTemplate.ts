/**
 * Checkout / move-out email.
 *
 * Now async — callers must await buildCheckoutEmail().
 * Header and footer come from lib/emailWrapper.ts (shared component).
 * The body retains its signature Courier brand styling.
 */

import { buildEmail } from '@/lib/emailWrapper'
import type { EmailSender } from '@/lib/email/sender'

export interface CheckoutEmailData {
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

export async function buildCheckoutEmail(data: CheckoutEmailData, sender?: EmailSender): Promise<string> {
  const moveOutFormatted = new Date(data.moveOutDate).toLocaleDateString('en-GB', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })

  // Body content — shared wrapper supplies the header and footer
  const body = `
<style>
  .co-hero{background:#d6d5d1;text-align:center;padding:28px 32px 0;border-bottom:3px solid #0a0a0a;}
  .co-hero h1{font-size:22px;font-weight:900;letter-spacing:.02em;text-transform:uppercase;margin:0 0 8px;font-family:'Courier New',Courier,monospace;}
  .co-hero .sub{font-size:15px;margin:0 0 20px;}
  .yellow-block{background:#FFE000;margin:0 -40px;padding:28px 40px 32px;text-align:center;}
  .yellow-block .big{font-size:52px;font-weight:900;line-height:1.05;letter-spacing:-.02em;font-family:'Courier New',Courier,monospace;}
  .co-section{padding:20px 0;text-align:center;line-height:1.75;border-bottom:1px solid #b0afa9;font-size:14px;color:#0a0a0a;}
  .co-section p+p{margin-top:14px;}
  .amount-big{font-size:32px;font-weight:900;letter-spacing:-.01em;margin:10px 0 6px;}
  .steps-hdr{background:#0a0a0a;color:#FFE000;text-align:center;padding:22px 32px;margin:0 -40px;}
  .steps-hdr h2{font-size:20px;font-weight:700;text-transform:uppercase;letter-spacing:.04em;margin:0;color:#FFE000;}
  .steps-intro{background:#f5f5f1;padding:20px 32px;text-align:center;font-size:14px;line-height:1.7;border-bottom:1px solid #ddd;margin:0 -40px;}
  .steps-intro p+p{margin-top:12px;}
  .step-item{background:#f5f5f1;padding:18px 32px;border-bottom:1px solid #e0dfda;font-size:14px;margin:0 -40px;}
  .step-item .icon{font-size:24px;margin:0 0 6px;}
  .step-item h3{font-weight:700;text-transform:uppercase;letter-spacing:.04em;margin:0 0 5px;font-size:14px;}
  .voucher{background:#FFE000;padding:24px 32px;text-align:center;border-top:3px solid #0a0a0a;border-bottom:3px solid #0a0a0a;font-size:13px;line-height:1.7;margin:24px -40px 0;}
  .voucher .icon{font-size:28px;margin:0 0 10px;}
  .voucher h2{font-size:16px;font-weight:700;text-transform:uppercase;letter-spacing:.04em;margin:0 0 14px;line-height:1.3;}
  .voucher p+p{margin-top:10px;}
  .signoff{padding:24px 0;text-align:center;font-size:14px;line-height:1.75;}
  .signoff p+p{margin-top:12px;}
  .signoff .brand{font-weight:700;font-size:17px;text-transform:uppercase;letter-spacing:.06em;margin-top:18px;font-family:'Courier New',Courier,monospace;}
</style>

<div class="co-hero">
  <h1>Sorry To See You Go!</h1>
  <p class="sub">It's the..</p>
  <div class="yellow-block">
    <div class="big">end<br>of<br>an<br>era.</div>
  </div>
</div>

<div class="co-section">
  <p>Dear ${data.tenantName},</p>
  <p>We are sorry to hear you are leaving us on <strong>${moveOutFormatted}</strong>.</p>
  <p>We hope you enjoyed your stay and wish you all the best in the future.</p>
</div>

<div class="co-section">
  <p>Just to confirm, your final rent payment is:</p>
  <p class="amount-big">£${data.proRataRent.toFixed(2)}</p>
</div>

<div class="co-section">
  <p>You are welcome to complete your departure on your own schedule. Just drop us an email to let us know when you have left the room and where in the room you have left the keys (e.g. top drawer of bedside table). Double check you have everything before you lock the front door!</p>
</div>

<div class="steps-hdr"><h2>3 Steps For A Speedy Deposit Refund</h2></div>

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
`

  return buildEmail(body, { sender })
}
