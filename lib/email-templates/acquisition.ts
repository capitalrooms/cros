// Capital Rooms — Landlord Acquisition Email Template
//
// Body content only — the shared wrapper (lib/emailWrapper.ts) provides header/footer.
// DO NOT add a <html>, <body>, or outer wrapper table here.
// All custom styles are scoped under .acq-wrap to avoid conflicts.

import { buildEmail } from '@/lib/emailWrapper'

const DEFAULT_HEADSHOT = 'https://cros-sigma.vercel.app/harry.jpg'

export interface AcquisitionEmailOptions {
  firstName: string           // replaces *|FNAME|*
  greeting?: string           // opening line after "Dear X,"
  headshotUrl?: string        // headshot image URL; falls back to DEFAULT_HEADSHOT
  igUrl?: string              // Instagram profile URL
  fbUrl?: string              // Facebook profile URL

  // Fees (shown in "our fees" section)
  managementFee?: string      // e.g. "5%" — default "5%"
  lettingFee?: string         // e.g. "4%" — default "4%"

  // Offer banner controls
  showOfferBanner?: boolean
  showFreeManagement?: boolean
  freeManagementMonths?: string | number
  showLettingDiscount?: boolean
  discountedLettingFee?: string
}

export async function acquisitionEmailHtml(opts: AcquisitionEmailOptions): Promise<string> {
  const {
    firstName,
    greeting = 'I hope this email finds you well.',
    headshotUrl,
    igUrl = 'https://www.instagram.com/capitalrooms',
    fbUrl = 'https://www.facebook.com/capitalrooms',
    managementFee = '5%',
    lettingFee = '4%',
    showOfferBanner = true,
    showFreeManagement = true,
    freeManagementMonths = 1,
    showLettingDiscount = true,
    discountedLettingFee = '2%',
  } = opts

  const resolvedHeadshot = headshotUrl || DEFAULT_HEADSHOT
  const headshot = `<img src="${resolvedHeadshot}" width="140" height="140" style="border-radius:12px;object-fit:cover;" alt="Harry Buchanan">`

  // margin:0 -40px breaks the content out of the wrapper's 40px body padding,
  // so the coloured sections span the full email width — same technique as checkout email.
  const body = `
<link href="https://fonts.googleapis.com/css2?family=Baloo+2:wght@600;700;800&family=Quicksand:wght@400;500;600;700&display=swap" rel="stylesheet">
<style>
  .acq-wrap, .acq-wrap table, .acq-wrap td { font-family:'Quicksand',Verdana,Arial,sans-serif; }
  .acq-headline { font-family:'Baloo 2','Comic Sans MS',Verdana,sans-serif; font-weight:700; }
  .acq-wrap table { border-collapse:collapse; }
  .acq-wrap img { border:0; display:block; }
  .acq-wrap a { text-decoration:none; }
  .acq-sw  { background-color:#FFFFFF; }
  .acq-lav { background-color:#F0EEFA; }
  .acq-grey{ background-color:#E3E2E2; }
  .acq-h1  { font-size:34px; color:#111111; text-align:center; }
  .acq-h2  { font-size:26px; color:#111111; }
  .acq-bt  { font-size:16px; line-height:1.6; color:#2A2A2A; }
  .acq-sc  { font-size:13px; letter-spacing:1px; text-transform:uppercase; color:#6B6A64; text-align:center; }
  .acq-star{ color:#F5C518; font-size:20px; }
  .acq-btn { background-color:#111111; color:#ffffff !important; font-weight:700; padding:14px 32px; border-radius:30px; display:inline-block; font-size:16px; }
  @media only screen and (max-width:600px){
    .acq-stk{ display:block !important; width:100% !important; }
    .acq-h1 { font-size:26px !important; }
    .acq-h2 { font-size:22px !important; }
    .acq-p  { padding-left:20px !important; padding-right:20px !important; }
  }
</style>
<div class="acq-wrap" style="margin:0 -40px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0">

  <!-- HERO -->
  <tr><td class="acq-sw" style="padding:44px 40px 30px;" align="center">
    <h1 class="acq-headline acq-h1" style="margin:0 0 26px;">let us make property simple.</h1>
    <table role="presentation" cellpadding="0" cellspacing="0"><tr>
      <td style="font-size:70px;padding:0 18px;">🏠</td>
      <td style="font-size:70px;padding:0 18px;">🤝</td>
    </tr></table>
  </td></tr>

  <!-- GREETING -->
  <tr><td class="acq-sw acq-p" style="padding:10px 40px 36px;">
    <p class="acq-bt" style="text-align:center;margin:0 0 14px;"><u><strong>Dear ${firstName},</strong></u></p>
    <p class="acq-bt" style="text-align:center;margin:0 0 14px;">${greeting}</p>
    <p class="acq-bt" style="text-align:center;margin:0;">We're thrilled to introduce our comprehensive property management service, designed to make your life easier and your properties <u>less</u> stressful and <u>more</u> profitable.</p>
  </td></tr>

  ${showOfferBanner ? `<!-- OFFER BANNER -->
  <tr><td class="acq-lav acq-p" style="padding:36px 40px;">
    <p class="acq-headline" style="text-align:center;font-size:20px;margin:0 0 20px;color:#111;">⭐ - Exclusive Offer for New Landlords! - ⭐</p>
    ${showFreeManagement ? `<p class="acq-headline" style="text-align:center;font-size:22px;margin:0 0 10px;color:#111;">${freeManagementMonths} Month${Number(freeManagementMonths) !== 1 ? 's' : ''} Free Management</p>
    <p class="acq-bt" style="text-align:center;margin:0 0 24px;">Enjoy ${freeManagementMonths} month${Number(freeManagementMonths) !== 1 ? 's' : ''} of <u>free property management</u> (${managementFee}) on your properties when you sign up with us for 12 months.</p>` : ''}
    ${showLettingDiscount ? `<p class="acq-headline" style="text-align:center;font-size:22px;margin:0 0 10px;color:#111;">Discounted Letting Fee</p>
    <p class="acq-bt" style="text-align:center;margin:0 0 20px;">Your first letting fee is discounted - just ${discountedLettingFee} instead of the usual ${lettingFee}.</p>` : ''}
    <p class="acq-bt" style="text-align:center;margin:0 0 14px;">We know landlords find it hard to make the leap to a new agent, which is why we offer a 1 month notice period to all new landlords who join us. This gives you that extra comfort to move forward.</p>
    <p class="acq-bt" style="text-align:center;margin:0;">Fortunately, <strong>we haven't had a landlord leave us since 2018.</strong></p>
  </td></tr>` : ''}

  <!-- WHY JOIN US -->
  <tr><td class="acq-sw" style="padding:44px 40px 20px;" align="center">
    <h2 class="acq-headline acq-h2" style="margin:0;">why you should join us!</h2>
  </td></tr>

  <!-- affordable maintenance -->
  <tr><td class="acq-sw acq-p" style="padding:20px 40px;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
      <td class="acq-stk" width="160" valign="top" style="font-size:60px;text-align:center;background-color:#E9E0F7;border-radius:12px;padding:20px 0;">🔧</td>
      <td class="acq-stk" width="20"></td>
      <td class="acq-stk" valign="top">
        <p class="acq-headline" style="font-size:19px;margin:0 0 8px;text-decoration:underline;">affordable maintenance</p>
        <p class="acq-bt" style="margin:0;">We handle all repairs and building work, including those pesky out-of-hours emergencies. You'll always be in the loop on major decisions but for the day to day management, let us save you the time!</p>
      </td>
    </tr></table>
  </td></tr>

  <!-- personable approach -->
  <tr><td class="acq-grey acq-p" style="padding:28px 40px;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
      <td class="acq-stk" width="160" valign="top" style="text-align:center;">${headshot}</td>
      <td class="acq-stk" width="20"></td>
      <td class="acq-stk" valign="top">
        <p class="acq-headline" style="font-size:19px;margin:0 0 8px;text-decoration:underline;">a personable approach</p>
        <p class="acq-bt" style="margin:0;">"After working in large agencies who were slow to respond to their landlords, I realised the way to happier landlords was for them to have a single point of contact for their property. I believe this is the future of management, where landlords deal with people who actually care about them."</p>
      </td>
    </tr></table>
  </td></tr>

  <!-- management you can trust -->
  <tr><td class="acq-sw acq-p" style="padding:28px 40px;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
      <td class="acq-stk" width="160" valign="top" style="font-size:60px;text-align:center;background-color:#DCEFE3;border-radius:12px;padding:20px 0;">🤝</td>
      <td class="acq-stk" width="20"></td>
      <td class="acq-stk" valign="top">
        <p class="acq-headline" style="font-size:19px;margin:0 0 8px;text-decoration:underline;">management you can trust</p>
        <p class="acq-bt" style="margin:0;">Some agencies make <strong>£1000s</strong> a month charging landlords for simple visits to their property. Dropping off a new microwave or kettle is a chance for further profit. Well, we consider this basic <strong>'property management'</strong> and you'll have already paid us for that.</p>
      </td>
    </tr></table>
  </td></tr>

  <!-- clear financial reports -->
  <tr><td class="acq-grey acq-p" style="padding:28px 40px;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
      <td class="acq-stk" width="160" valign="top" style="font-size:60px;text-align:center;background-color:#D9E8F7;border-radius:12px;padding:20px 0;">🧾</td>
      <td class="acq-stk" width="20"></td>
      <td class="acq-stk" valign="top">
        <p class="acq-headline" style="font-size:19px;margin:0 0 8px;text-decoration:underline;">clear financial reports</p>
        <p class="acq-bt" style="margin:0;">Monthly statements, deposit protection, and hassle-free invoicing - tailored to your preferences. Plus, an annual profit and loss statement at year-end!</p>
      </td>
    </tr></table>
  </td></tr>

  <!-- complete compliance -->
  <tr><td class="acq-sw acq-p" style="padding:28px 40px;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
      <td class="acq-stk" width="160" valign="top" style="font-size:60px;text-align:center;background-color:#FBEBD3;border-radius:12px;padding:20px 0;">🔒</td>
      <td class="acq-stk" width="20"></td>
      <td class="acq-stk" valign="top">
        <p class="acq-headline" style="font-size:19px;margin:0 0 8px;text-decoration:underline;">complete compliance</p>
        <p class="acq-bt" style="margin:0;">Having most of our portfolio as HMO properties has helped us master the health and safety compliance required in property. We organise all of this for you, from liaison with councils for new licenses to instructing gas safety checks.</p>
      </td>
    </tr></table>
  </td></tr>

  <!-- next level inspections -->
  <tr><td class="acq-grey acq-p" style="padding:28px 40px;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
      <td class="acq-stk" width="160" valign="top" style="font-size:60px;text-align:center;background-color:#F3D9DE;border-radius:12px;padding:20px 0;">🔍</td>
      <td class="acq-stk" width="20"></td>
      <td class="acq-stk" valign="top">
        <p class="acq-headline" style="font-size:19px;margin:0 0 8px;text-decoration:underline;">next level inspections</p>
        <p class="acq-bt" style="margin:0;">Our inspection reports are unparalleled. When we visit the property, we colour code maintenance in order of importance, then give you a general breakdown of each area with 3 different pricing options for modernising or improving in future.</p>
      </td>
    </tr></table>
  </td></tr>

  <!-- a.i interior design -->
  <tr><td class="acq-sw acq-p" style="padding:28px 40px 40px;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
      <td class="acq-stk" width="160" valign="top" style="font-size:60px;text-align:center;background-color:#E9E0F7;border-radius:12px;padding:20px 0;">📱</td>
      <td class="acq-stk" width="20"></td>
      <td class="acq-stk" valign="top">
        <p class="acq-headline" style="font-size:19px;margin:0 0 8px;text-decoration:underline;">a.i - interior design</p>
        <p class="acq-bt" style="margin:0;">Whenever you're thinking of updating certain areas of the property, we use AI to generate different styles for the space. When you give us the greenlight, we make the dream a reality.</p>
      </td>
    </tr></table>
  </td></tr>

  <!-- OUR FEES -->
  <tr><td class="acq-lav acq-p" style="padding:44px 40px;">
    <h2 class="acq-headline acq-h2" style="text-align:center;margin:0 0 26px;">our fees</h2>
    <p class="acq-sc" style="margin:0 0 8px;">Management</p>
    <p class="acq-bt" style="text-align:center;margin:0 0 24px;">All these services are included at a rate of <strong>${managementFee} (plus VAT)</strong> per month.</p>
    <p class="acq-sc" style="margin:0 0 8px;">Lettings</p>
    <p class="acq-bt" style="text-align:center;margin:0 0 24px;">For procuring a new tenant, referencing, and initiating a new tenancy, we charge a <strong>${lettingFee} let fee</strong> based on the agreed term.</p>
    <p class="acq-headline" style="text-align:center;font-size:18px;margin:0 0 10px;">Statements &amp; Invoicing</p>
    <p class="acq-bt" style="text-align:center;margin:0 0 14px;">Our preferred method is to receive monthly rent from tenants by the <strong>1st</strong> of each month into our designated client account. We deduct incurred costs and process payment to you by the <strong>5th</strong> of each month, accompanied by a detailed monthly statement.</p>
    <p class="acq-bt" style="text-align:center;margin:0;">We're flexible and can accommodate your preferred invoicing arrangement, and at year-end our software can generate an annual profit and loss statement for each unit or property.</p>
  </td></tr>

  <!-- TESTIMONIALS -->
  <tr><td class="acq-grey acq-p" style="padding:44px 40px;">
    <h2 class="acq-headline acq-h2" style="text-align:center;margin:0 0 30px;">what our landlords say about us...</h2>
    <p style="text-align:center;margin:0 0 6px;" class="acq-star">★★★★★</p>
    <p class="acq-bt" style="text-align:center;margin:0 0 26px;font-style:italic;">"Harry has been fantastic. We moved from a large agency as we wanted a more personal service. Harry at Capital Rooms has been everything we wanted and more. Harry negotiated a very significant rent rise and on the same day I received an email from our tenant saying they were happy to accept the rise because they much preferred working with Capital Rooms. I cannot recommend Harry and Capital Rooms enough."</p>
    <p style="text-align:center;margin:0 0 6px;" class="acq-star">★★★★★</p>
    <p class="acq-bt" style="text-align:center;margin:0 0 26px;font-style:italic;">"I am a new BTL owner - we were thoroughly impressed by Harry Buchanan, in the manner he went about renting our property. He has done a marvellous job."</p>
    <p style="text-align:center;margin:0 0 6px;" class="acq-star">★★★★★</p>
    <p class="acq-bt" style="text-align:center;margin:0 0 26px;font-style:italic;">"Capital Rooms are by far the best agency I have worked with in the last 10 years. As a landlord I have had no voids so far, all maintenance issues have been dealt with promptly and the communication is personal and professional. Thanks to Harry and his team."</p>
    <p style="text-align:center;margin:0 0 6px;" class="acq-star">★★★★★</p>
    <p class="acq-bt" style="text-align:center;margin:0;font-style:italic;">"Capital Rooms are fantastic managing agents for me. My vacancies are always let quickly, maintenance issues are dealt with efficiently and tenants are happy. Communication is very easy and quick and they get things done, so as a Landlord I'm really happy too!"</p>
  </td></tr>

  <!-- FINALLY / CTA -->
  <tr><td class="acq-sw acq-p" style="padding:50px 40px;" align="center">
    <h2 class="acq-headline acq-h1" style="margin:0 0 26px;">finally...</h2>
    <p class="acq-bt" style="text-align:center;margin:0 0 20px;">Want to get the ball rolling or discuss how to move ahead?</p>
    <p class="acq-bt" style="text-align:center;margin:0 0 20px;">Just pop over an email with a time that suits you and we can call you to discuss the next steps.</p>
    <p class="acq-bt" style="text-align:center;margin:0 0 30px;">Looking forward to hearing from you.</p>
    <a href="mailto:management@capitalrooms.co.uk" class="acq-btn">Reply to Harry</a>
    <p class="acq-headline" style="font-size:20px;margin:34px 0 4px;">Harry</p>
    <p style="margin:0 0 4px;font-size:16px;">@</p>
    <p class="acq-headline" style="font-size:20px;margin:0 0 28px;">Capital Rooms</p>
    <table role="presentation" cellpadding="0" cellspacing="0"><tr>
      <td style="padding:0 8px;"><a href="${igUrl}" style="display:inline-block;background:#555;color:#fff;font-size:13px;font-weight:700;padding:10px 16px;border-radius:22px;letter-spacing:0.5px;">IG</a></td>
      <td style="padding:0 8px;"><a href="https://www.capitalrooms.co.uk" style="display:inline-block;background:#555;color:#fff;font-size:13px;font-weight:700;padding:10px 16px;border-radius:22px;letter-spacing:0.5px;">WEB</a></td>
      <td style="padding:0 8px;"><a href="${fbUrl}" style="display:inline-block;background:#555;color:#fff;font-size:13px;font-weight:700;padding:10px 16px;border-radius:22px;letter-spacing:0.5px;">FB</a></td>
    </tr></table>
    <p style="margin:24px 0 6px;"><a href="https://www.capitalrooms.co.uk" style="color:#3B6FD6;font-weight:600;">www.capitalrooms.co.uk</a></p>
  </td></tr>

</table>
</div>`

  return buildEmail(body)
}
