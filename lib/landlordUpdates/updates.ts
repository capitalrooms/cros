// Landlord updates on a new tenant (17 Oct 2026, migration 228). One place for every email a landlord gets about the
// person coming into their property — managed or let only:
//   offer        an offer for the landlord to look at before we accept it (Nigel likes to review first); the private
//                page lets them answer "happy to go ahead" / "not this one"
//   reserved     holding deposit taken, the room is off the market
//   referenced   referencing passed — contact details, work, Right to Rent; the documents on a private page
//   signed_paid  agreement signed and the move-in money in; deposit protection when it's done
//   summary      everything above in one, for when the earlier ones were missed
// Nothing is ever sent by itself: the office opens a draft, changes what it likes, and presses Send.
// Passports / ID go to let-only landlords (the Right to Rent check is theirs to keep); on a managed house we did the
// check, so they get its result and date instead — the ID stays with us unless someone ticks it on purpose.
import type { SupabaseClient } from '@supabase/supabase-js'
import { randomBytes } from 'crypto'
import { dearName, displayName } from '@/lib/people'
import { isWholeLet, placeLabel } from '@/lib/lettings/letWording'
import { fullAddressLine } from '@/lib/formatAddress'
import { agreedRent } from '@/lib/lettings/holdingDeposit'
import { profileFor, type HousemateProfile } from '@/lib/housemates/profile'
import { answeredList, hasEnoughToShow } from '@/lib/icebreaker'

export const STAGES = ['offer', 'reserved', 'referenced', 'signed_paid', 'summary', 'housemate'] as const
export type UpdateStage = typeof STAGES[number]
export const STAGE_LABEL: Record<UpdateStage, string> = {
  offer: 'Offer to review', reserved: 'Room reserved', referenced: 'Referencing passed', signed_paid: 'Signed & paid', summary: 'New tenant report',
  housemate: 'Meet your new housemate',
}
/** documents that may go with each stage; ID ones only for let-only by default */
const ALL_DOCS = ['tenancy_agreement', 'reference_report', 'employment_letter', 'payslip', 'bank_statement', 'guarantor', 'student', 'right_to_rent', 'id_proof', 'deposit_certificate', 'inventory', 'referencing_evidence', 'guarantor_document', 'other']
// the applicant's own evidence (bank statements, payslips…) — offered, never ticked by default (6 Nov 2026)
const PRIVATE_DOCS = ['referencing_evidence', 'bank_statement', 'payslip', 'guarantor', 'guarantor_document', 'other']
const STAGE_DOCS: Record<UpdateStage, string[]> = {
  // an offer can carry what they've sent us so far — offered, never ticked by default
  offer: ALL_DOCS, reserved: ALL_DOCS,
  referenced: ['reference_report', 'employment_letter', 'payslip', 'bank_statement', 'guarantor', 'student', 'right_to_rent', 'id_proof'],
  // signed & paid is the full pack — everything on file (Harry, 17 Oct 2026: "containing everything")
  signed_paid: ALL_DOCS,
  summary: ALL_DOCS,
  housemate: [],   // a card to forward to the other tenants — never documents
}
const ID_DOCS = ['id_proof', 'right_to_rent']
export const DOC_LABEL: Record<string, string> = {
  reference_report: 'Referencing report', employment_letter: 'Employment / income letter', id_proof: 'Passport or ID',
  right_to_rent: 'Right to Rent check', tenancy_agreement: 'Signed tenancy agreement', deposit_certificate: 'Deposit protection certificate',
  payslip: 'Payslip', bank_statement: 'Bank statement', guarantor: 'Guarantor document', student: 'Student enrolment',
  referencing_evidence: 'Referencing evidence', guarantor_document: 'Guarantor document', inventory: 'Inventory', other: 'Other document',
}
export const SHARE_DAYS = 7
/** what the document scan called it (lib/ai-classify) → our document types */
export function applicantDocType(t: string | null | undefined): string {
  const x = String(t ?? '').toLowerCase()
  if (/passport|id_doc|identity|driving|brp|visa/.test(x)) return 'id_proof'
  if (/right_to_rent|share_code/.test(x)) return 'right_to_rent'
  if (/reference|homeppl/.test(x)) return 'reference_report'
  if (/employ|contract|offer_letter/.test(x)) return 'employment_letter'
  if (/payslip|pay_slip/.test(x)) return 'payslip'
  if (/bank/.test(x)) return 'bank_statement'
  if (/guarant/.test(x)) return 'guarantor'
  if (/student|enrol|university/.test(x)) return 'student'
  return 'other'
}

const gbp = (n: number) => `£${n.toLocaleString('en-GB', { minimumFractionDigits: n % 1 ? 2 : 0, maximumFractionDigits: 2 })}`
// Nigel likes their age (3 Nov 2026) — worked out from the date of birth, which stays available but off by default
const ageOf = (iso?: string | null) => {
  if (!iso) return ''
  const b = new Date(`${String(iso).slice(0, 10)}T12:00:00Z`), n = new Date()
  const y = n.getUTCFullYear() - b.getUTCFullYear() - ((n.getUTCMonth() < b.getUTCMonth() || (n.getUTCMonth() === b.getUTCMonth() && n.getUTCDate() < b.getUTCDate())) ? 1 : 0)
  return y > 0 && y < 120 ? String(y) : ''
}
const long = (iso?: string | null) => iso ? new Date(`${String(iso).slice(0, 10)}T12:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }) : ''

export interface UpdateContext {
  applicantId: string | null
  tenancyId: string | null
  letOnly: boolean
  whole: boolean
  place: string
  landlord: { id: string; name: string; greeting: string; emails: string[]; commsOn: boolean; tenantUpdatesOff: boolean } | null
  tenant: { name: string; email: string | null; phone: string | null; job: string | null; company: string | null; study: string | null; salary: string | null; dob: string | null; nationality: string | null; currentAddress: string | null; linkedin: string | null; requirements: string | null; bio: string | null; guarantor: string | null }
  rent: number | null
  askingRent: number | null
  offeredBelow: boolean
  startDate: string | null
  term: string | null
  hold: { amount: number; on: string } | null
  deposit: number | null
  depositProtected: { on: string | null; scheme: string | null; ref: string | null } | null
  /** the landlord receives the deposit and protects it themselves (let only, or their own setting — migration 265) */
  landlordHoldsDeposit: boolean
  referencingPassed: string | null
  rightToRent: { checked: string | null; until: string | null }
  agreementSigned: string | null
  moniesIn: string | null
  /** the tenant's documents: filed on the tenancy, or uploaded against the application during referencing */
  docs: { id: string; type: string; label: string; fileName: string; source: 'tenancy' | 'applicant' }[]
  sent: { id: string; stage: UpdateStage; sent_at: string; sent_to: string[]; answer: string | null; answer_note: string | null; first_viewed_at: string | null }[]
  /** their "say hello" profile from the move-in pack (lib/housemates/profile) — only when they chose to share it */
  profile: (HousemateProfile & { firstName: string }) | null
}

/** Everything known about the incoming tenant, from the application and (once there is one) the tenancy. */
export async function loadUpdateContext(s: SupabaseClient, ids: { applicantId?: string | null; tenancyId?: string | null }): Promise<UpdateContext | null> {
  let t: any = null
  if (ids.tenancyId) {
    ({ data: t } = await s.from('tenancies')
      .select('*, people!person_id(id, salutation, first_name, last_name, full_name, email, phone, occupation, job_title, nationality, date_of_birth, right_to_rent_until, applicant_id), rooms(name), properties(id, name, address, postcode, letting_type, landlord_id, property_type)')
      .eq('id', ids.tenancyId).maybeSingle())
    if (!t) return null
  }
  const applicantId = ids.applicantId ?? t?.applicant_id ?? t?.people?.applicant_id ?? null
  let a: any = null
  if (applicantId) ({ data: a } = await s.from('applicants')
    .select('*, rooms(name, current_asking_rent), properties(id, name, address, postcode, letting_type, landlord_id, property_type)')
    .eq('id', applicantId).maybeSingle())
  if (!t && !a) return null
  // the tenancy this application became, when we started from the application
  if (!t && a) {
    const { data: tt } = await s.from('tenancies').select('id').eq('applicant_id', a.id).is('let_cancelled_at', null).order('created_at', { ascending: false }).limit(1).maybeSingle()
    if (tt) return loadUpdateContext(s, { applicantId: a.id, tenancyId: (tt as any).id })
  }

  const prop = t?.properties ?? a?.properties ?? {}
  const roomName = t?.rooms?.name ?? a?.rooms?.name ?? ''
  const whole = isWholeLet(prop.property_type, roomName)
  // the full postal address (postcode once, spaced); some addresses on file leave out the street, which is then in the
  // house's name ("12 Saltwell Street" + "Poplar, London, E14 0DX")
  const base = fullAddressLine(prop)
  const address = prop.name && /^\d/.test(prop.name) && !base.toLowerCase().includes(String(prop.name).toLowerCase()) ? `${prop.name}, ${base}` : base

  const [landlordQ, prefQ, holdQ, docsQ, appDocsQ, sentQ, offerQ] = await Promise.all([
    prop.landlord_id ? s.from('people').select('id, salutation, first_name, last_name, full_name, company, email, joint_salutation, joint_first_name, joint_last_name, joint_email, landlord_comms_enabled').eq('id', prop.landlord_id).maybeSingle() : Promise.resolve({ data: null }),
    prop.landlord_id ? s.from('landlord_notification_prefs').select('enabled').eq('person_id', prop.landlord_id).eq('category', 'tenant_changes').maybeSingle() : Promise.resolve({ data: null }),
    s.from('holding_deposits').select('amount, received_on, status').or([t ? `tenancy_id.eq.${t.id}` : '', applicantId ? `applicant_id.eq.${applicantId}` : ''].filter(Boolean).join(',')).in('status', ['held', 'applied']).order('recorded_at').limit(1).maybeSingle(),
    t ? s.from('property_documents').select('id, document_type, file_name').eq('tenancy_id', t.id).order('uploaded_at', { ascending: false }) : Promise.resolve({ data: [] }),
    applicantId ? s.from('applicant_documents').select('id, doc_type, file_name, ai_summary').eq('applicant_id', applicantId).order('created_at') : Promise.resolve({ data: [] }),
    s.from('landlord_updates').select('id, stage, sent_at, sent_to, answer, answer_note, first_viewed_at').or([t ? `tenancy_id.eq.${t.id}` : '', applicantId ? `applicant_id.eq.${applicantId}` : ''].filter(Boolean).join(',')).order('sent_at', { ascending: false }),
    a?.offer_id ? s.from('offers').select('id, advertised_rent, move_in_date').eq('id', a.offer_id).maybeSingle() : Promise.resolve({ data: null }),
  ])
  const l: any = (landlordQ as any).data
  const person = t?.people
  const prof = person?.id ? await profileFor(s, person.id).catch(() => null) : null
  const rent = t?.rent_amount != null ? Number(t.rent_amount) : a ? await agreedRent(s, a, (offerQ as any).data).catch(() => null) : null
  const asking = a?.rooms?.current_asking_rent != null ? Number(a.rooms.current_asking_rent) : null
  const hold: any = (holdQ as any).data

  return {
    applicantId, tenancyId: t?.id ?? null,
    letOnly: prop.letting_type === 'let_only',
    whole,
    place: placeLabel(whole, roomName, address),
    landlord: l ? {
      id: l.id,
      name: [l.salutation, l.first_name, l.last_name].filter(Boolean).join(' ') || l.full_name || l.company || '',
      greeting: dearName(l),
      emails: [l.email, l.joint_email].filter(Boolean),
      commsOn: l.landlord_comms_enabled !== false,
      tenantUpdatesOff: (prefQ as any).data?.enabled === false,
    } : null,
    tenant: {
      name: person ? displayName(person) : a ? displayName(a) : '',
      email: person?.email ?? a?.email ?? null,
      phone: person?.phone ?? a?.phone ?? null,
      job: a?.profession || person?.job_title || person?.occupation || null,
      company: a?.applicant_profile?.application?.company ?? null,
      study: (() => { const st = a?.applicant_profile?.application; return st?.student ? [st.university, st.course, st.year].filter(Boolean).join(' · ') || 'Student' : null })(),
      salary: a?.salary ? String(a.salary) : null,
      dob: a?.date_of_birth ?? person?.date_of_birth ?? null,
      linkedin: a?.linkedin_url ?? null,
      requirements: [a?.room_requirements, a?.room_conditions].map(x => String(x ?? '').trim()).filter(Boolean).join('\n') || null,
      nationality: person?.nationality ?? null,
      currentAddress: a?.current_address ?? null,
      bio: a?.bio ?? null,
      guarantor: a?.guarantor_name ? a.guarantor_name : a?.guarantor_needed ? 'Needed — details to follow' : null,
    },
    rent,
    askingRent: asking,
    offeredBelow: !!a && a.rent_offer_type === 'below_asking' && !!a.offered_rent && !!asking && Number(a.offered_rent) < asking,
    startDate: t?.start_date ?? a?.preferred_start_date ?? (offerQ as any).data?.move_in_date ?? null,
    term: a?.preferred_term ?? null,
    hold: hold ? { amount: Number(hold.amount), on: hold.received_on } : null,
    deposit: t?.deposit_amount != null ? Number(t.deposit_amount) : null,
    landlordHoldsDeposit: t?.deposit_held_by ? t.deposit_held_by === 'landlord' : prop.letting_type === 'let_only',
    depositProtected: t?.deposit_protected_at ? { on: t.deposit_protected_at, scheme: t.deposit_scheme ?? null, ref: t.deposit_scheme_ref ?? t.deposit_reference ?? null } : null,
    referencingPassed: t?.referencing_passed_at ?? null,
    rightToRent: { checked: t?.right_to_rent_checked_at ?? null, until: person?.right_to_rent_until ?? null },
    agreementSigned: t?.agreement_signed_at ?? null,
    moniesIn: t?.move_in_monies_received_at ?? null,
    docs: [
      // the same file listed twice (Homeppl sends some twice) is offered once
      ...(((docsQ as any).data ?? []) as any[]).filter(d => DOC_LABEL[d.document_type] && !/\.json$/i.test(d.file_name ?? ''))
        .filter((d, i, all) => all.findIndex(x => x.document_type === d.document_type && x.file_name === d.file_name) === i).map(d => ({ id: d.id, type: d.document_type, label: DOC_LABEL[d.document_type], fileName: d.file_name ?? '', source: 'tenancy' as const })),
      ...(((appDocsQ as any).data ?? []) as any[]).map(d => { const type = applicantDocType(d.doc_type); return { id: d.id, type, label: DOC_LABEL[type] ?? (d.ai_summary ? String(d.ai_summary).slice(0, 60) : 'Document'), fileName: d.file_name ?? '', source: 'applicant' as const } }),
    ],
    sent: ((sentQ as any).data ?? []) as UpdateContext['sent'],
    profile: prof && prof.visible && (prof.hasPhoto || hasEnoughToShow(prof.answers)) ? { ...prof, firstName: person?.first_name ?? '' } : null,
  }
}

/** Which updates make sense now, and which one is due (its step is done but the landlord hasn't been told). */
export function stageStatus(c: UpdateContext): { stage: UpdateStage; ready: boolean; due: boolean; sentAt: string | null; why: string }[] {
  const sentAt = (st: UpdateStage) => c.sent.find(x => x.stage === st)?.sent_at ?? null
  const rows: { stage: UpdateStage; ready: boolean; why: string }[] = [
    { stage: 'offer', ready: !!c.applicantId, why: c.applicantId ? 'Before you accept it' : 'No application on file' },
    { stage: 'reserved', ready: !!c.hold, why: c.hold ? `Holding deposit ${long(c.hold.on)}` : 'Once the holding deposit is in' },
    { stage: 'referenced', ready: !!c.referencingPassed, why: c.referencingPassed ? `Passed ${long(c.referencingPassed)}` : 'Once referencing has passed' },
    { stage: 'signed_paid', ready: !!c.agreementSigned && !!c.moniesIn, why: c.agreementSigned && c.moniesIn ? `Signed ${long(c.agreementSigned)}, paid ${long(c.moniesIn)}` : 'Once signed and the move-in money is in' },
    { stage: 'summary', ready: true, why: 'Everything so far, in one' },
    { stage: 'housemate', ready: !!c.profile && !!c.tenancyId, why: c.profile ? 'A card they can forward to the other tenants' : 'Once the tenant has said hello in their move-in pack' },
  ]
  // Due: a step that's done which the landlord hasn't heard about — only before move-in. When more than one has been
  // missed, the full report is the one to send (Harry: "a full summary … if the other processes were missed").
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/London' })
  const beforeMoveIn = !c.startDate || c.startDate.slice(0, 10) >= today
  const later = (st: UpdateStage) => STAGES.slice(STAGES.indexOf(st) + 1).some(x => x !== 'summary' && sentAt(x))
  const missed = rows.filter(r => r.ready && r.stage !== 'summary' && r.stage !== 'offer' && r.stage !== 'housemate' && !sentAt(r.stage) && !sentAt('summary') && !later(r.stage)).map(r => r.stage)
  const due = new Set<UpdateStage>(!beforeMoveIn ? [] : missed.length > 1 ? ['summary'] : missed)
  return rows.map(r => ({ ...r, sentAt: sentAt(r.stage), due: due.has(r.stage), why: r.stage === 'summary' && due.has('summary') ? 'Earlier updates were missed — send them all in one' : r.why }))
}

export interface Draft { subject: string; message: string; photo: boolean | null; facts: { label: string; value: string; on: boolean }[]; docs: { id: string; type: string; label: string; fileName: string; on: boolean; idDoc: boolean }[] }

/** How the place is said in a letter (7 Nov 2026, Harry: "ROOM 1, LONDON just looks crap"): "Room 1 at 95 Rope Street",
 *  the street alone for a whole let — never the town or postcode in a sentence or subject line. */
function spoken(c: { place: string; whole: boolean }): { say: string; room: string; street: string } {
  const parts = c.place.split(/,\s*/)
  const room = !c.whole && parts.length > 1 && /^(room|flat|studio|unit)\b/i.test(parts[0]) ? parts.shift()! : ''
  const street = parts.shift() ?? c.place
  return { say: room ? `${room} at ${street}` : street, room, street }
}

/** The draft for one stage: a letter in our usual voice, the facts underneath, and which documents go with it. */
export function draftFor(c: UpdateContext, stage: UpdateStage): Draft {
  const n = c.tenant.name || 'the applicant'
  const unit = c.whole ? 'property' : 'room'
  const sp = spoken(c)
  const at = c.whole ? `the property at ${sp.street}` : sp.say   // "Room 3 at 12 Example Street" — never "the room at Room 3"
  const dear = `Dear ${c.landlord?.greeting ?? 'Sir or Madam'},`
  const rentLine = c.rent ? `${gbp(c.rent)} pcm${stage === 'offer' && c.offeredBelow && c.askingRent ? ` (asking ${gbp(c.askingRent)})` : ''}` : ''
  const F = (label: string, value: string | null | undefined, on = true) => value ? [{ label, value, on }] : []
  const t = c.tenant
  const work = [t.job, t.company].filter(Boolean).join(' at ')
  // the applicant sheet, in the order landlords ask for it (Nigel's list, 17 Oct 2026)
  const profile = [
    ...F('Full name', t.name), ...F('Contact number', t.phone), ...F('Email address', t.email), ...F('Age', ageOf(t.dob)), ...F('Date of birth', long(t.dob), false),
    ...F('Current address', t.currentAddress), ...F('Profession & company', work), ...F('University & course', t.study), ...F('Salary', t.salary),
    ...F(stage === 'offer' ? 'Move-in date (requested)' : 'Move-in date', long(c.startDate)), ...F('Planned stay', c.term),
    ...F('LinkedIn', t.linkedin), ...F('Requirements in property', t.requirements),
  ]
  const rentF = F(stage === 'offer' ? 'Rent offered' : 'Rent', rentLine)
  const rtr = c.rightToRent.checked ? `Checked ${long(c.rightToRent.checked)}${c.rightToRent.until ? ` · valid until ${long(c.rightToRent.until)}` : ' · no time limit'}` : ''
  const protectedLine = c.depositProtected ? `${c.depositProtected.scheme ?? 'Protected'}${c.depositProtected.ref ? ` · ${c.depositProtected.ref}` : ''} · ${long(c.depositProtected.on)}` : ''

  const everything = () => [...profile, ...rentF,
    ...F('Holding deposit', c.hold ? `${gbp(c.hold.amount)} · received ${long(c.hold.on)}` : ''),
    ...F('References', c.referencingPassed ? `Passed ${long(c.referencingPassed)}` : ''), ...F('Right to Rent', rtr), ...F('Guarantor', t.guarantor),
    ...F('Agreement signed', long(c.agreementSigned)), ...F('Move-in money', c.moniesIn ? `Received ${long(c.moniesIn)}` : ''),
    ...F('Deposit', c.deposit ? `${gbp(c.deposit)}${c.landlordHoldsDeposit ? ' · paid to you to protect' : ''}` : ''), ...(c.landlordHoldsDeposit ? [] : F('Deposit protection', protectedLine))]

  let subject = '', body: string[] = [], facts: Draft['facts'] = []
  switch (stage) {
    case 'offer':
      subject = `Offer for your review — ${sp.say}`
      body = [
        `We have received an offer for ${at} and, before accepting it, we would welcome your thoughts.`,
        `The applicant is ${n}${c.tenant.job ? `, who works as ${work}` : ''}.${c.rent ? ` They have offered ${rentLine}.` : ''}`,
        ...(c.tenant.bio?.trim() ? [`In their own words: “${c.tenant.bio.trim()}”`] : []),
        'You can let us know on the page below whether you are happy for us to go ahead — or simply reply to this email. We will not take a holding deposit until we have heard from you.',
      ]
      facts = [...profile, ...rentF, ...F('Guarantor', t.guarantor)]
      break
    case 'reserved':
      subject = `Applicant secured — ${sp.say}`
      body = [
        `We are delighted to let you know that we have secured an applicant for ${at}, subject to satisfactory references${c.letOnly ? ' and your approval' : ''}.`,
        `${n} has paid a holding deposit${c.hold ? ` of ${gbp(c.hold.amount)} on ${long(c.hold.on)}` : ''}, so the ${unit} is now off the market while references are obtained.`,
        `Their full application details are below${c.letOnly ? ' — please let us know if you have any questions or concerns before referencing begins' : ''}.`,
      ]
      facts = [...profile, ...rentF, ...F('Holding deposit', c.hold ? `${gbp(c.hold.amount)} · received ${long(c.hold.on)}` : ''), ...F('Guarantor', t.guarantor)]
      break
    case 'referenced':
      subject = `References passed — ${sp.say}`
      body = [
        `Good news: ${n} has passed referencing for ${at}.`,
        c.letOnly
          ? 'Their contact details are below, and their referencing report and identity documents come with this email. As the landlord on a let-only tenancy, please keep a copy of the Right to Rent documents for your records.'
          : 'Their contact details are below, and their referencing report comes with this email. We have carried out the Right to Rent check and keep the identity documents on file.',
      ]
      facts = [...profile, ...rentF, ...F('References', c.referencingPassed ? `Passed ${long(c.referencingPassed)}` : ''), ...F('Right to Rent', rtr), ...F('Guarantor', t.guarantor), ...F('Nationality', t.nationality, false)]
      break
    case 'signed_paid':
      subject = c.letOnly ? `Lettings statement – ${sp.room ? `${sp.room}, ${sp.street}` : sp.street}` : `Tenancy signed — ${sp.say}`
      body = [
        `${n} has signed the tenancy agreement for ${at}${c.moniesIn ? ' and paid everything due before moving in' : ''}.`,
        c.startDate ? `The tenancy starts on ${long(c.startDate)}.` : '',
        // who protects it follows who holds it (6 Nov 2026, Harry: "we do not protect Nigel's deposits as he gets his own")
        c.landlordHoldsDeposit
          ? (c.deposit ? `The deposit of ${gbp(c.deposit)} comes to you with the first month’s rent. As you hold it, please protect it with a government-approved scheme and give the tenant the prescribed information within 30 days of receiving it.` : '')
          : c.depositProtected ? `The deposit is protected with ${c.depositProtected.scheme ?? 'the scheme'}.` : c.deposit ? 'We will protect the deposit within 30 days, and confirm once it is.' : '',
        ...(c.letOnly ? ['Please find attached your lettings statement, showing the rent and deposit received, our letting fee and the balance paid to you.'] : []),
        'The signed agreement, references and documents come with this email for your records.',
      ].filter(Boolean)
      facts = everything()
      break
    case 'housemate': {
      const first = c.profile?.firstName || n
      subject = `Meet your new housemate — ${first}, moving into ${c.whole ? sp.street : sp.room}`
      body = [
        `Here’s a short introduction to ${first}, who is moving into ${at}${c.startDate ? ` on ${long(c.startDate)}` : ''} — in their own words.`,
        `If you’d like your other tenants to know a little about who’s joining them, you’re welcome to forward this email. The card below holds only what ${first} chose to share — no contact or financial details.`,
      ]
      facts = []
      break
    }
    case 'summary':
      subject = c.letOnly ? `Lettings statement – ${sp.room ? `${sp.room}, ${sp.street}` : sp.street}` : `Your new tenant — ${sp.say}`
      body = [
        `Please find below a summary of your new tenant in ${at}, with everything we have on file so far.`,
        c.letOnly ? 'Their documents, including the Right to Rent documents for your records, come with this email.' : 'Their documents come with this email. We have carried out the Right to Rent check and keep the identity documents on file.',
      ]
      facts = everything()
      break
  }
  const docs = c.docs.filter(d => STAGE_DOCS[stage].includes(d.type))
    .map(d => ({ id: d.id, type: d.type, label: d.label, fileName: d.fileName, idDoc: ID_DOCS.includes(d.type), on: stage === 'offer' || stage === 'reserved' || PRIVATE_DOCS.includes(d.type) ? false : ID_DOCS.includes(d.type) ? c.letOnly : true }))
  const message = [dear, ...body, 'Should you need anything further, please do not hesitate to contact us.', 'Kind regards,'].join('\n\n')
  // their photo beside "Your tenant" — offered only when they added one and are happy to share it (null = none)
  return { subject, message, facts, docs, photo: c.profile?.hasPhoto ? stage !== 'offer' : null }
}

export const newShareToken = () => randomBytes(18).toString('base64url')

/** The dark band at the top of the email: the property and the tenancy's key terms (lib/landlordUpdates/email). */
export function headlineFor(c: UpdateContext, stage: UpdateStage): { eyebrow: string; place: string; lead: string; street: string; sub: string; terms: { label: string; value: string }[] } {
  const money = (n: number) => `£${n.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
  const eyebrow = ({ offer: 'An offer for your review', reserved: 'Applicant secured', referenced: 'References passed', signed_paid: c.letOnly ? 'New let · signed & paid' : 'Tenancy signed', summary: 'Your new tenant', housemate: 'Meet your new housemate' } as Record<UpdateStage, string>)[stage]
  // "Room 1, 95 Rope Street, London, SE16 7TF" → the street for the headline, the rest underneath
  const parts = c.place.split(/,\s*/)
  const roomPart = !c.whole && parts.length > 1 && /^(room|flat|studio|unit)\b/i.test(parts[0]) ? parts.shift()! : ''
  const street = parts.shift() ?? c.place
  const lead = ({ offer: 'An offer for', reserved: 'Reserved at', referenced: 'References passed at', signed_paid: 'Your new tenant at', summary: 'Your new tenant at', housemate: 'Say hello to' } as Record<UpdateStage, string>)[stage]
  // the housemate card is for forwarding to the other tenants: their name, never the rent or deposit
  if (stage === 'housemate') {
    const first = c.profile?.firstName || c.tenant.name.split(' ').slice(-2, -1)[0] || c.tenant.name
    return { eyebrow, place: c.place, lead, street: first, sub: [[roomPart, street].filter(Boolean).join(', '), c.startDate ? `Moving in ${long(c.startDate)}` : ''].filter(Boolean).join('\n'), terms: [] }
  }
  const sub = [roomPart, c.startDate ? `${stage === 'offer' ? 'Hoping to move in' : 'Moving in'} ${long(c.startDate)}` : ''].filter(Boolean).join('\n')
  // let only, with the statement (7 Nov 2026, Harry: "title it more like lettings statement - x room, x number")
  const statementTitle = c.letOnly && (stage === 'summary' || stage === 'signed_paid')
  return {
    ...(statementTitle ? { eyebrow: 'Your new tenant', place: c.place, lead: 'Lettings statement', street: [roomPart, street].filter(Boolean).join(', '),
      sub: [c.tenant.name, c.startDate ? `Moving in ${long(c.startDate)}` : ''].filter(Boolean).join('\n') } : { eyebrow, place: c.place, lead, street, sub }),
    terms: [
      ...(c.rent ? [{ label: stage === 'offer' ? 'Rent offered' : 'Rent', value: `${money(c.rent)} pcm` }] : []),
      ...(c.deposit && stage !== 'offer' ? [{ label: 'Deposit', value: money(c.deposit) }] : []),
      ...(c.startDate ? [{ label: stage === 'offer' ? 'Move-in' : 'Start date', value: long(c.startDate) }] : []),
    ],
  }
}

/** The card for "Meet your new housemate": their photo and what they chose to share — nothing else. */
export function housemateCard(c: UpdateContext): { first: string; photoUrl: string | null; items: { label: string; value: string }[] } | null {
  if (!c.profile) return null
  return { first: c.profile.firstName || c.tenant.name, photoUrl: c.profile.photoUrl, items: answeredList(c.profile.answers).map(x => ({ label: x.q.prompt, value: x.a })) }
}
