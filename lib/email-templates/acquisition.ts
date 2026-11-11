// Capital Rooms — the landlord introduction email ("let us make property simple"), rebuilt 11 Nov 2026 (Harry: "build
// your own version … that version is just copying an old bad version"). It is the website in an email: the same words
// (lib/website/site — headline, what landlords get, the Google rating, the founder's quote, real landlord reviews),
// the site's fonts and colours, one column, 16px text, one clear button. Body only — the wrapper adds the logo bar
// and the sender's signature. The options are the ones the acquisition screen already sends.
import { buildEmail } from '@/lib/emailWrapper'
import { LANDLORD_FEATURES, GOOGLE_RATING, FOUNDER_QUOTE, OFFICE } from '@/lib/website/site'
import reviews from '@/lib/website/content/reviews.json'

const SITE = 'https://capitalrooms.co.uk'
const DEFAULT_HEADSHOT = `${SITE}/website/team/harry.jpg`

export interface AcquisitionEmailOptions {
  firstName: string           // who it's to: "Mr Smith" (the greeting follows the house rule — titles, never a lone first name)
  greeting?: string           // the line after "Dear …,"
  headshotUrl?: string
  igUrl?: string
  fbUrl?: string
  managementFee?: string      // e.g. "5%"
  lettingFee?: string         // e.g. "4%"
  showOfferBanner?: boolean
  showFreeManagement?: boolean
  freeManagementMonths?: string | number
  showLettingDiscount?: boolean
  discountedLettingFee?: string
}

// the website's palette and type (app/site/site.css)
const FOREST = '#1F3B2E', INK = '#132219', TEXT = '#22332A', MUTED = '#56665C', LINE = '#DCE3DA', SAGE = '#EEF3EC', GOLD = '#E8B931', CREAM = '#FBF8F1'
const DISPLAY = "'Bricolage Grotesque','Helvetica Neue',Arial,sans-serif"
const BODY = "Figtree,'Helvetica Neue',Arial,sans-serif"
const esc = (v: string) => String(v).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!))

const eyebrow = (t: string, color = MUTED) => `<p style="margin:0 0 10px;font-family:${BODY};font-size:12px;font-weight:600;letter-spacing:.14em;text-transform:uppercase;color:${color};">${t}</p>`
const h2 = (t: string) => `<h2 style="margin:0 0 16px;font-family:${DISPLAY};font-size:28px;line-height:1.1;font-weight:700;letter-spacing:-.01em;color:${INK};">${t}</h2>`
const p = (t: string, extra = '') => `<p style="margin:0 0 16px;font-family:${BODY};font-size:16px;line-height:1.65;color:${TEXT};${extra}">${t}</p>`
const button = (label: string, href: string, onDark = false) => `<table role="presentation" cellpadding="0" cellspacing="0" style="border-collapse:separate;"><tr>
  <td bgcolor="${onDark ? GOLD : FOREST}" style="background:${onDark ? GOLD : FOREST};border-radius:999px;">
    <a href="${href}" style="display:inline-block;padding:15px 28px;font-family:${BODY};font-size:16px;font-weight:600;color:${onDark ? INK : CREAM};text-decoration:none;border-radius:999px;">${label}</a>
  </td></tr></table>`
const section = (inner: string, top = 40) => `<div style="padding-top:${top}px;">${inner}</div>`

export async function acquisitionEmailHtml(opts: AcquisitionEmailOptions): Promise<string> {
  const {
    firstName,
    greeting = 'I hope this email finds you well.',
    headshotUrl,
    managementFee = '5%',
    lettingFee = '4%',
    showOfferBanner = true,
    showFreeManagement = true,
    freeManagementMonths = 1,
    showLettingDiscount = true,
    discountedLettingFee = '2%',
  } = opts
  const months = Number(freeManagementMonths) || 1
  const landlordReviews = (reviews as { quote: string; name: string; role: string | null }[]).filter(r => r.role === 'Landlord' && r.quote.length >= 120 && r.quote.length < 420).slice(0, 2)   // the fuller ones

  // 1. the opening: the website's headline, then a short personal note
  const opening = `
    ${eyebrow('For landlords')}
    <h1 style="margin:0 0 22px;font-family:${DISPLAY};font-size:40px;line-height:1.02;font-weight:800;letter-spacing:-.02em;color:${INK};">The personal service big agencies can’t give.</h1>
    ${p(`Dear ${esc(firstName || 'Sir or Madam')},`)}
    ${p(esc(greeting))}
    ${p('I’m Harry, the founder of Capital Rooms. We’ve looked after landlords’ properties across London since 2018: shared houses and single lets, mostly in east and south east London. You get one person who knows your property, picks up the phone and keeps you in the loop, backed by our own app.')}
    <table role="presentation" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin:6px 0 0;"><tr>
      <td style="padding:0 10px 0 0;font-family:${BODY};font-size:18px;letter-spacing:2px;color:${INK};">&#9733;&#9733;&#9733;&#9733;&#9733;</td>
      <td style="font-family:${BODY};font-size:14px;color:${MUTED};"><strong style="color:${INK};">${GOOGLE_RATING.stars} on Google</strong> from ${GOOGLE_RATING.count} reviews</td>
    </tr></table>`

  // 2. the offer for new landlords (switched on/off on the acquisition screen)
  const offerLines = [
    showFreeManagement ? [`${months} month${months === 1 ? '' : 's'} of free management`, `No management fee (${esc(managementFee)}) for your first ${months === 1 ? 'month' : `${months} months`} when you sign up with us for 12 months.`] : null,
    showLettingDiscount ? [`Your first letting fee at ${esc(discountedLettingFee)}`, `Instead of our usual ${esc(lettingFee)}.`] : null,
    ['One month’s notice', 'If it isn’t working for you, you can leave on a month’s notice. We haven’t had a landlord leave since 2018.'],
  ].filter(Boolean) as [string, string][]
  const offer = showOfferBanner ? section(`
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;"><tr>
      <td bgcolor="${FOREST}" style="background:${FOREST};border-radius:20px;padding:30px 28px;">
        ${eyebrow('For new landlords', GOLD)}
        <p style="margin:0 0 18px;font-family:${DISPLAY};font-size:28px;line-height:1.1;font-weight:700;color:${CREAM};">Try us, without the risk.</p>
        ${offerLines.map(([t, d], i) => `
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;border-top:1px solid rgba(251,248,241,.18);"><tr>
            <td valign="top" style="width:28px;padding:14px 0;font-family:${BODY};font-size:15px;font-weight:700;color:${GOLD};">0${i + 1}</td>
            <td style="padding:14px 0;"><p style="margin:0;font-family:${BODY};font-size:16px;font-weight:600;color:${CREAM};">${t}</p><p style="margin:4px 0 0;font-family:${BODY};font-size:14.5px;line-height:1.55;color:#C9D6CC;">${d}</p></td>
          </tr></table>`).join('')}
      </td></tr></table>`) : ''

  // 3. what you get — the website's own list
  const features = section(`
    ${eyebrow('What you get')}
    ${h2('See everything. Worry about nothing.')}
    ${LANDLORD_FEATURES.map(([t, d], i) => `
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;border-top:1px solid ${i ? LINE : INK};"><tr>
        <td valign="top" style="width:40px;padding:16px 0;font-family:${DISPLAY};font-size:18px;font-weight:700;color:${FOREST};">${String(i + 1).padStart(2, '0')}</td>
        <td style="padding:16px 0;"><p style="margin:0;font-family:${BODY};font-size:16px;font-weight:600;color:${INK};">${esc(t)}</p><p style="margin:4px 0 0;font-family:${BODY};font-size:15px;line-height:1.6;color:${MUTED};">${esc(d)}</p></td>
      </tr></table>`).join('')}`)

  // 4. the fees, plainly
  const fees = section(`
    ${eyebrow('Simple fees')}
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;"><tr>
      <td width="50%" valign="top" style="width:50%;padding:20px;background:${SAGE};border-radius:16px 0 0 16px;">
        <p style="margin:0;font-family:${BODY};font-size:13px;color:${MUTED};">Full management</p>
        <p style="margin:6px 0 0;font-family:${DISPLAY};font-size:34px;line-height:1;font-weight:800;color:${INK};">${esc(managementFee)}</p>
        <p style="margin:6px 0 0;font-family:${BODY};font-size:13px;line-height:1.5;color:${MUTED};">of the rent, everything above included</p>
      </td>
      <td width="50%" valign="top" style="width:50%;padding:20px;background:${SAGE};border-left:2px solid #FFFFFF;border-radius:0 16px 16px 0;">
        <p style="margin:0;font-family:${BODY};font-size:13px;color:${MUTED};">Finding a tenant</p>
        <p style="margin:6px 0 0;font-family:${DISPLAY};font-size:34px;line-height:1;font-weight:800;color:${INK};">${esc(lettingFee)}</p>
        <p style="margin:6px 0 0;font-family:${BODY};font-size:13px;line-height:1.5;color:${MUTED};">referencing and the new tenancy set up</p>
      </td>
    </tr></table>
    ${p('We never mark up a contractor’s invoice, and there’s no charge for dropping round to your property.', 'margin:14px 0 0;font-size:14.5px;color:' + MUTED + ';')}`)

  // 5. the founder, in his own words
  const founder = section(`
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;"><tr>
      <td width="88" valign="top" style="width:88px;padding:0 18px 0 0;"><img src="${esc(headshotUrl || DEFAULT_HEADSHOT)}" width="88" height="88" alt="Harry Buchanan" style="display:block;border:0;width:88px;height:88px;border-radius:44px;object-fit:cover;"></td>
      <td valign="top">
        <p style="margin:0;font-family:${BODY};font-size:18px;line-height:1.55;font-style:italic;color:${INK};">“${esc(FOUNDER_QUOTE)}”</p>
        <p style="margin:12px 0 0;font-family:${BODY};font-size:14px;color:${MUTED};"><strong style="color:${INK};">Harry Buchanan</strong>, founder</p>
      </td>
    </tr></table>`)

  // 6. what landlords say
  const said = landlordReviews.length ? section(`
    ${eyebrow('What our landlords say')}
    ${landlordReviews.map(r => `
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin:0 0 12px;"><tr>
        <td style="padding:20px 22px;background:${SAGE};border-radius:16px;">
          <p style="margin:0 0 8px;font-family:${BODY};font-size:14px;letter-spacing:2px;color:${INK};">&#9733;&#9733;&#9733;&#9733;&#9733;</p>
          <p style="margin:0;font-family:${BODY};font-size:15px;line-height:1.6;color:${TEXT};">“${esc(r.quote)}”</p>
          <p style="margin:10px 0 0;font-family:${BODY};font-size:13px;font-weight:600;color:${INK};">${esc(r.name)}</p>
        </td></tr></table>`).join('')}`) : ''

  // 7. one clear next step
  const close = section(`
    ${h2('Shall we talk?')}
    ${p('Get a free valuation of what your property should let for, or just reply to this email with a time that suits you and I’ll call.')}
    ${button('Get a free valuation', `${SITE}/instant_valuation`)}
    ${p(`Or call us on <a href="${OFFICE.phoneHref}" style="color:${FOREST};font-weight:600;text-decoration:underline;">${OFFICE.phone}</a>.`, 'margin:16px 0 0;font-size:15px;')}
    ${p('Looking forward to hearing from you.', 'margin:26px 0 0;')}`)

  return buildEmail(`${opening}${offer}${features}${fees}${founder}${said}${close}`, { kind: 'landlord-acquisition', signature: true })
}
