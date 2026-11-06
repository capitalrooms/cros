// Real-template previews for the Email hub (6 Nov 2026, Harry: "I want to see every type of email we have on file"):
// each email that has its own template is made from it here with example details — the email exactly as it's built,
// in whichever theme is being previewed. Emails written inside the code that sends them have no template to call
// yet; for those the hub shows the latest real copy (lib/email/samples) until they're moved into a template.
import { previewTheme } from '@/lib/email/previewTheme'
import type { EmailTheme } from '@/lib/email/themes'
import { buildEmail } from '@/lib/emailWrapper'
import { landlordUpdateHtml } from '@/lib/landlordUpdates/email'
import { buildOfferLetterEmail, buildSearchIsOverEmail } from '@/lib/emailTemplates'
import { buildCheckoutEmail } from '@/lib/checkoutEmailTemplate'
import { acquisitionEmailHtml } from '@/lib/email-templates/acquisition'
import { houseEmailHtml } from '@/lib/houseDocs'
import { moveOutEmail } from '@/lib/checkout/moveOut'
import { emailHtml as quickHtml } from '@/lib/tenancy/quickMessages'
import { messageHtml } from '@/lib/email/messageHtml'

const EX = {
  tenant: 'Mr Ziqing Wang', dear: 'Mr Wang', first: 'Ziqing', landlord: 'Mr Spalding', place: 'Room 1, 95 Rope Street, London, SE16 7TF',
  street: '95 Rope Street', room: 'Room 1', start: '2026-10-29', rent: 1200, deposit: 1384.61, hold: 276.92,
}
const headline = (eyebrow: string, lead: string) => ({ eyebrow, place: EX.place, lead, street: EX.street, sub: `${EX.room} · London SE16 7TF\nMoving in 29 October 2026`, terms: [{ label: 'Rent', value: '£1,200.00 pcm' }, { label: 'Deposit', value: '£1,384.61' }] })
const facts = [{ label: 'Full name', value: EX.tenant }, { label: 'Contact number', value: '+44 7700 900123' }, { label: 'Email address', value: 'z.wang@example.com' }, { label: 'Profession & company', value: 'Client Advisor at Loewe' }, { label: 'References', value: 'Passed 26 October 2026' }, { label: 'Right to Rent', value: 'Checked 28 October 2026 · no time limit' }]
const letter = (body: string[]) => [`Dear ${EX.landlord},`, ...body, 'Should you need anything further, please do not hesitate to contact us.', 'Kind regards,'].join('\n\n')
const update = (stage: string, eyebrow: string, lead: string, body: string[], extra: Record<string, unknown> = {}) =>
  landlordUpdateHtml({ stage, message: letter(body), facts, link: null, until: null, headline: headline(eyebrow, lead), kind: `landlord-update-${stage}`, ...extra } as any)

const MAKERS: Record<string, () => Promise<string>> = {
  'landlord-update-offer': () => update('offer', 'An offer for your review', 'An offer for', ['We have received an offer for Room 1 and, before accepting it, we would welcome your thoughts.']),
  'landlord-update-reserved': () => update('reserved', 'Applicant secured', 'Reserved at', ['We are delighted to let you know that we have secured an applicant for Room 1, subject to satisfactory references.']),
  'landlord-update-referenced': () => update('referenced', 'References passed', 'References passed at', [`Good news: ${EX.tenant} has passed referencing for Room 1.`]),
  'landlord-update-signed_paid': () => update('signed_paid', 'New let · signed & paid', 'Your new tenant at', [`${EX.tenant} has signed the tenancy agreement for Room 1 and paid everything due before moving in.`, 'The deposit comes to you with the first month’s rent. As you hold it, please protect it within 30 days.'], {
    statement: { deposit: EX.deposit, depositWeeks: 5, holding: EX.hold, rentIn: EX.rent, rentMonths: 1, fee: 900, feeLabel: 'Flat fee', due: 1684.61, paidOn: '2026-11-06', payRef: 'B20261106 091ROS01', bank: { bank: 'HSBC', name: 'Mr Nigel Spalding', sortCode: '40-39-04', last4: '9333' } },
    attached: ['Lettings statement.pdf', 'Signed tenancy agreement.pdf', 'Right to Rent check.pdf', 'Passport.jpg'] }),
  'landlord-update-summary': () => update('summary', 'Your new tenant', 'Your new tenant at', ['Please find below a summary of your new tenant, with everything we have on file so far.']),
  'landlord-update-housemate': () => landlordUpdateHtml({ stage: 'housemate', message: letter([`Here’s a short introduction to ${EX.first}, who is moving into Room 1 on 29 October.`, 'You’re welcome to forward this email to your other tenants.']), facts: [], link: null, until: null, headline: { eyebrow: 'Meet your new housemate', place: EX.place, lead: 'Say hello to', street: EX.first, sub: 'Room 1, 95 Rope Street\nMoving in 29 October 2026', terms: [] }, card: { first: EX.first, photoUrl: null, items: [{ label: 'What do you do, in a few words?', value: 'Client advisor at Loewe' }, { label: 'At the weekend you’ll usually find me…', value: 'Cooking, Live music' }, { label: 'Something people wouldn’t guess about you', value: 'I can solve a Rubik’s cube in under a minute' }] }, kind: 'landlord-update-housemate' } as any),
  'housemate-intro': () => landlordUpdateHtml({ stage: 'housemate', message: ['Hello,', `We wanted to introduce you to ${EX.first}, who is moving into Room 1 on 29 October.`, 'Please do make them feel welcome.', 'Kind regards,'].join('\n\n'), facts: [], link: null, until: null, headline: { eyebrow: 'Your new housemate', place: EX.place, lead: 'Say hello to', street: EX.first, sub: 'Room 1 · moving in 29 October', terms: [] }, card: { first: EX.first, photoUrl: null, items: [{ label: 'A film or series you’d recommend', value: 'Paddington 2' }, { label: 'Early bird or night owl?', value: 'Night owl' }] }, kind: 'housemate-intro' } as any),
  'offer-letter': () => buildOfferLetterEmail({ applicantName: EX.tenant, roomName: EX.room, propertyAddress: EX.street, propertyCity: 'London', advertisedRent: EX.rent, moveInDate: EX.start, term: 'Over a year', applicationUrl: '#', holdingDeposit: EX.hold, holdingRef: 'HOLD-095ROS01' } as any),
  'search-is-over': () => buildSearchIsOverEmail({ applicantName: EX.tenant, roomName: EX.room, propertyAddress: EX.street, propertyCity: 'London', advertisedRent: EX.rent, moveInDate: EX.start, term: 'Over a year', applicationUrl: '#', holdingDeposit: EX.hold, holdingRef: 'HOLD-095ROS01' } as any),
  'move-out': async () => buildEmail(moveOutEmail({ whole: false, dear: EX.dear, place: EX.place, moveOutDate: '2026-11-18', lastRent: { amount: 636.16, days: 18 }, deposit: EX.deposit, depositProtected: true, phone: '020 7112 9163', email: 'management@capitalrooms.co.uk', formUrl: '#' } as any).html, { kind: 'move-out' }),
  'landlord-acquisition': () => acquisitionEmailHtml({ firstName: 'Nigel' } as any),
  'house-docs': () => buildEmail(houseEmailHtml(EX.dear, EX.street, [
    { key: 'gas', label: 'Gas safety certificate', url: '#', uploadedAt: '2026-03-02', nextDue: '2027-03-01', recent: false },
    { key: 'eicr', label: 'Electrical safety report (EICR)', url: '#', uploadedAt: '2024-05-14', nextDue: '2029-05-13', recent: false },
    { key: 'epc', label: 'Energy performance certificate', url: '#', uploadedAt: '2023-01-10', nextDue: '2033-01-09', recent: false },
  ] as any, 'Please find the latest certificates for the house below.'), { kind: 'house-docs' }),
  'compliance-certs': () => buildEmail(houseEmailHtml(EX.landlord, EX.street, [
    { key: 'gas', label: 'Gas safety certificate', url: '#', uploadedAt: '2026-03-02', nextDue: '2027-03-01', recent: true },
    { key: 'eicr', label: 'Electrical safety report (EICR)', url: '#', uploadedAt: '2024-05-14', nextDue: '2029-05-13', recent: false },
    { key: 'hmo', label: 'HMO licence', url: '#', uploadedAt: '2025-06-01', nextDue: '2030-05-31', recent: false },
  ] as any, 'Please find all of the house’s current certificates below for your records.'), { kind: 'compliance-certs' }),
  'quick-message': () => buildEmail(quickHtml('Just a reminder that the gas engineer is coming on Thursday between 8 and 12 for the annual safety check.\n\nPlease make sure the boiler cupboard is clear.', EX.dear), { kind: 'quick-message' }),
  'landlord-statement': () => buildEmail(messageHtml(`Dear ${EX.landlord},\n\nPlease find attached your statement for October 2026.\n\nKind regards,`), { kind: 'landlord-statement' }),
  'letter': () => buildEmail(messageHtml(`Dear ${EX.dear},\n\nPlease find your letter attached.\n\nKind regards,`), { kind: 'letter' }),
  'tenancy-agreement': () => buildEmail(messageHtml(`Dear ${EX.dear},\n\nPlease find your tenancy agreement attached, ready to sign.\n\nKind regards,`), { kind: 'tenancy-agreement' }),
}

/** The email made from its own template in this theme — or null when it has none yet (use the latest real copy). */
export async function previewFromTemplate(kind: string, theme: EmailTheme): Promise<string | null> {
  const make = MAKERS[kind]
  if (!make) return null
  try { return await previewTheme.run(theme, make) } catch (e: any) { console.warn('preview', kind, e?.message); return null }
}
export const HAS_TEMPLATE = new Set(Object.keys(MAKERS))
