// Automated first-pass AML review of a submitted landlord onboarding form.
// Produces checks, a suggested risk level with reasons, and notifies the office. A person must
// confirm the review — the suggestion never approves anyone by itself.
// Risk factors follow HMRC AMLG3300 (letting agency businesses) and MLR 2017 regs 28, 33 and 35.
import { svc } from '@/lib/landlordOnboarding/store'
import { readDocument, type DocReading, type DocKind } from '@/lib/aml/docCheck'
import { screenName, type ScreeningResult } from '@/lib/aml/sanctions'
import { sendEmail } from '@/lib/sendEmail'
import { fetchPDFBizSettings } from '@/lib/pdfLetterhead'

export type CheckStatus = 'pass' | 'review' | 'fail'
export interface ReviewCheck { area: string; label: string; status: CheckStatus; detail: string }
export interface ReviewPerson { role: string; name: string; dob?: string; nationality?: string; screening?: ScreeningResult; screeningError?: string }
export interface AutomatedReview {
  generated_at: string
  suggested_level: 'low' | 'medium' | 'high'
  reasons: string[]
  checks: ReviewCheck[]
  people: ReviewPerson[]
  documents: DocReading[]
  sanctions_list_date?: string
}

// HMRC AMLG3300 higher-risk jurisdictions plus the FATF "call for action" list.
const HIGH_RISK_COUNTRIES = [
  'north korea', 'dprk', 'iran', 'myanmar',
  'russia', 'belarus', 'kazakhstan', 'kyrgyzstan', 'ukraine', 'tajikistan', 'turkmenistan', 'uzbekistan',
  'armenia', 'azerbaijan', 'georgia', 'angola', 'ghana', 'nigeria', 'china', 'pakistan',
  'albania', 'serbia', 'montenegro', 'north macedonia', 'bosnia', 'kosovo',
]
const HIGH_RISK_CORPORATE = ['isle of man', 'british virgin islands', 'bvi', 'jersey', 'guernsey', 'gibraltar', 'united arab emirates', 'uae']
const UK = /^(uk|u\.k\.|united kingdom|england|scotland|wales|northern ireland|great britain|gb)$/i

type F = Record<string, unknown> & { documents?: Record<string, string[]> }
const str = (f: F, k: string) => (typeof f[k] === 'string' ? (f[k] as string).trim() : '')
const tokens = (s: string) => s.toLowerCase().normalize('NFKD').replace(/[^a-z\s-]/g, ' ').split(/[\s-]+/).filter(t => t.length > 1)
const inList = (s: string, list: string[]) => list.some(c => s.toLowerCase().includes(c))
const pc = (s?: string) => (s ?? '').toUpperCase().replace(/\s+/g, '')

function nameMatches(typed: string, onDoc?: string | string[]): boolean | null {
  const docs = (Array.isArray(onDoc) ? onDoc : onDoc ? [onDoc] : []).filter(Boolean)
  if (!docs.length) return null
  const t = tokens(typed)
  if (t.length < 2) return null
  const first = t[0], last = t[t.length - 1]
  return docs.some(d => { const dt = tokens(d); return dt.includes(last) && (dt.includes(first) || dt.some(x => x[0] === first[0])) })
}

const daysBetween = (a: string, b: Date) => (b.getTime() - new Date(a).getTime()) / 86400000
// Dates may arrive as YYYY-MM-DD or DD/MM/YYYY.
function isoDate(d?: string): string | undefined {
  if (!d) return undefined
  const m = d.trim().match(/^(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{4})$/)
  if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`
  return d.trim().slice(0, 10)
}

export async function runSubmissionReview(onboardingId: string): Promise<AutomatedReview> {
  const { data: row } = await svc().from('landlord_onboarding').select('*').eq('id', onboardingId).single()
  if (!row) throw new Error('Onboarding record not found')
  const f = (row.form_data ?? {}) as F
  const docs = f.documents ?? {}
  const now = new Date()
  const checks: ReviewCheck[] = []
  const high: string[] = []
  const medium: string[] = []
  const add = (area: string, label: string, status: CheckStatus, detail: string) => checks.push({ area, label, status, detail })

  const company = f.entity_type === 'company'
  const joint = f.entity_type === 'individual' && f.joint === 'yes'

  // ── People to identify and screen ────────────────────────────────────────
  const people: ReviewPerson[] = []
  if (company) {
    people.push({ role: 'Company', name: str(f, 'company_name') })
    for (const line of str(f, 'directors').split('\n').map(l => l.split(',')[0].trim()).filter(Boolean)) {
      people.push({ role: 'Director / beneficial owner', name: line })
    }
  } else {
    people.push({ role: joint ? 'First landlord' : 'Landlord', name: `${str(f, 'first_name')} ${str(f, 'last_name')}`.trim(), dob: str(f, 'dob'), nationality: str(f, 'nationality') })
    if (joint) people.push({ role: 'Second landlord', name: `${str(f, 'j_first_name')} ${str(f, 'j_last_name')}`.trim(), dob: str(f, 'j_dob'), nationality: str(f, 'j_nationality') })
  }

  // ── Documents: read in parallel ──────────────────────────────────────────
  const plan: { type: string; kind: DocKind }[] = company
    ? [{ type: 'director_id', kind: 'id' }, { type: 'director_address', kind: 'address' }, { type: 'proof_of_ownership', kind: 'ownership' }]
    : [
        { type: 'id_document', kind: 'id' }, { type: 'proof_of_address', kind: 'address' },
        ...(joint ? [{ type: 'joint_id_document', kind: 'id' as DocKind }, { type: 'joint_proof_of_address', kind: 'address' as DocKind }] : []),
        { type: 'proof_of_ownership', kind: 'ownership' },
      ]
  // Newest first: a landlord who re-uploads a clearer copy should be judged on that copy.
  const jobs = plan.flatMap(p => (docs[p.type] ?? []).slice(-3).reverse().map(path => ({ ...p, path })))
  const [readings, screenings] = await Promise.all([
    Promise.all(jobs.map(j => readDocument(j.path, j.kind).then(r => ({ ...r, docType: j.type })))),
    Promise.all(people.map(p => screenName(p.name, isoDate(p.dob) || undefined).then(
      s => ({ ok: true as const, s }),
      e => ({ ok: false as const, e: e instanceof Error ? e.message : 'Screening failed' }),
    ))),
  ])
  screenings.forEach((r, i) => { if (r.ok) people[i].screening = r.s; else people[i].screeningError = r.e })
  // Prefer a reading that succeeded; otherwise the newest.
  const byType = (t: string) => {
    const rs = readings.filter(r => (r as DocReading & { docType: string }).docType === t)
    return [...rs.filter(r => r.ok), ...rs.filter(r => !r.ok)]
  }

  // ── Identity (reg 28(2)–(4)) ─────────────────────────────────────────────
  const idChecks = company
    ? [{ who: 'Directors', idType: 'director_id', addrType: 'director_address', name: '', dob: '', postcode: str(f, 'registered_office').split('\n').pop() ?? '' }]
    : [
        { who: joint ? 'First landlord' : 'Landlord', idType: 'id_document', addrType: 'proof_of_address', name: people[0].name, dob: str(f, 'dob'), postcode: str(f, 'addr_postcode') },
        ...(joint ? [{ who: 'Second landlord', idType: 'joint_id_document', addrType: 'joint_proof_of_address', name: people[1].name, dob: str(f, 'j_dob'), postcode: f.j_same_address === true ? str(f, 'addr_postcode') : str(f, 'j_addr_postcode') }] : []),
      ]

  for (const p of idChecks) {
    const ids = byType(p.idType)
    if (!ids.length) { add('Identity', `${p.who}: photo ID`, 'fail', 'No identity document uploaded'); high.push(`${p.who} has not provided photo ID`); continue }
    const r = ids[0]
    if (!r.ok) { add('Identity', `${p.who}: photo ID`, 'review', `Uploaded but could not be read automatically (${r.error}). Check by eye.`); medium.push(`${p.who}'s ID needs a manual check`) }
    else {
      const fd = r.fields
      const isId = fd.document_type && !/not an identity/i.test(fd.document_type)
      add('Identity', `${p.who}: photo ID type`, isId ? 'pass' : 'fail', fd.document_type ?? 'Could not tell what the document is')
      if (!isId) high.push(`${p.who}'s upload does not appear to be an identity document`)
      if (p.name) {
        const m = nameMatches(p.name, fd.full_name)
        add('Identity', `${p.who}: name on ID`, m === true ? 'pass' : m === false ? 'fail' : 'review', `Form: ${p.name} · ID: ${fd.full_name ?? 'not read'}`)
        if (m === false) high.push(`${p.who}'s name on the ID does not match the form`)
      }
      if (p.dob) {
        const same = fd.date_of_birth ? isoDate(fd.date_of_birth) === isoDate(p.dob) : null
        add('Identity', `${p.who}: date of birth`, same === true ? 'pass' : same === false ? 'fail' : 'review', `Form: ${p.dob} · ID: ${fd.date_of_birth ?? 'not read'}`)
        if (same === false) high.push(`${p.who}'s date of birth on the ID does not match the form`)
      }
      if (fd.expiry_date) {
        const expired = new Date(fd.expiry_date) < now
        add('Identity', `${p.who}: ID in date`, expired ? 'fail' : 'pass', `Expires ${fd.expiry_date}`)
        if (expired) medium.push(`${p.who}'s ID has expired`)
      } else add('Identity', `${p.who}: ID in date`, 'review', 'Expiry date not read — check by eye')
      if (fd.concerns?.length) { add('Identity', `${p.who}: document quality`, 'review', fd.concerns.join('; ')); medium.push(`${p.who}'s ID raised questions: ${fd.concerns.join('; ')}`) }
    }

    const addrs = byType(p.addrType)
    if (!addrs.length) { add('Address', `${p.who}: proof of address`, 'fail', 'No proof of address uploaded'); high.push(`${p.who} has not provided proof of address`); continue }
    const a = addrs[0]
    if (!a.ok) { add('Address', `${p.who}: proof of address`, 'review', `Could not be read automatically (${a.error}). Check by eye.`); medium.push(`${p.who}'s proof of address needs a manual check`); continue }
    const fa = a.fields
    const acceptable = /utility|gas|electric|water|bank|building society|council tax|hmrc|tax|broadband|phone|mortgage|tenancy/i.test(`${fa.document_type ?? ''} ${fa.issuer ?? ''}`)
    add('Address', `${p.who}: proof of address type`, acceptable ? 'pass' : 'review', [fa.document_type, fa.issuer].filter(Boolean).join(' — ') || 'Type not recognised')
    if (!acceptable) medium.push(`${p.who}'s proof of address may not be an acceptable document type`)
    if (p.postcode) {
      const same = fa.postcode ? pc(fa.postcode) === pc(p.postcode) : null
      add('Address', `${p.who}: postcode matches`, same === true ? 'pass' : same === false ? 'fail' : 'review', `Form: ${p.postcode} · Document: ${fa.postcode ?? 'not read'}`)
      if (same === false) medium.push(`${p.who}'s proof of address shows a different postcode`)
    }
    if (p.name) {
      const m = nameMatches(p.name, fa.names_on_document)
      add('Address', `${p.who}: name on proof of address`, m === true ? 'pass' : m === false ? 'fail' : 'review', `Named: ${(fa.names_on_document ?? []).join(', ') || 'not read'}`)
      if (m === false) medium.push(`${p.who} is not named on their proof of address`)
    }
    if (fa.issue_date) {
      const age = daysBetween(fa.issue_date, now)
      add('Address', `${p.who}: dated within 3 months`, age <= 92 ? 'pass' : 'fail', `Dated ${fa.issue_date}`)
      if (age > 92) medium.push(`${p.who}'s proof of address is more than 3 months old`)
    } else add('Address', `${p.who}: dated within 3 months`, 'review', 'Date not read — check by eye')
    if (fa.concerns?.length) { add('Address', `${p.who}: document quality`, 'review', fa.concerns.join('; ')); medium.push(`${p.who}'s proof of address raised questions`) }
  }

  // ── Ownership / right to let ─────────────────────────────────────────────
  const own = byType('proof_of_ownership')
  if (!own.length) { add('Ownership', 'Proof of ownership', 'fail', 'Not uploaded'); high.push('No proof of ownership') }
  else if (!own[0].ok) { add('Ownership', 'Proof of ownership', 'review', `Could not be read automatically (${own[0].error})`); medium.push('Proof of ownership needs a manual check') }
  else {
    const fo = own[0].fields
    add('Ownership', 'Proof of ownership type', 'pass', fo.document_type ?? 'Read')
    const ownerNames = people.filter(p => p.role !== 'Director / beneficial owner').map(p => p.name)
    const named = ownerNames.map(n => nameMatches(n, fo.names_on_document))
    const anyNamed = company ? (fo.names_on_document ?? []).some(n => tokens(n).some(t => tokens(str(f, 'company_name')).includes(t))) : named.some(x => x === true)
    add('Ownership', 'Owner named on document', anyNamed ? 'pass' : fo.names_on_document?.length ? 'fail' : 'review', `Named: ${(fo.names_on_document ?? []).join(', ') || 'not read'}`)
    if (!anyNamed && fo.names_on_document?.length) medium.push('The landlord is not named on the ownership document')
    const propPc = f.property_count === 'multiple' ? ((f.properties as Array<Record<string, string>> | undefined)?.[0]?.postcode ?? '') : str(f, 'prop_postcode')
    if (propPc && fo.postcode) {
      const same = pc(propPc) === pc(fo.postcode)
      add('Ownership', 'Property postcode matches', same ? 'pass' : 'review', `Form: ${propPc} · Document: ${fo.postcode}`)
      if (!same) medium.push('Ownership document postcode differs from the property given')
    }
    if (fo.concerns?.length) { add('Ownership', 'Document quality', 'review', fo.concerns.join('; ')); medium.push('Ownership document raised questions') }
  }

  // ── Sanctions (SAMLA 2018 / UK Sanctions List) ───────────────────────────
  for (const p of people) {
    if (p.screeningError) { add('Sanctions', `${p.name || p.role}`, 'review', `Screening could not run: ${p.screeningError}`); medium.push('Sanctions screening needs re-running'); continue }
    const strong = p.screening?.matches.filter(m => m.strength === 'strong') ?? []
    const possible = p.screening?.matches.filter(m => m.strength === 'possible') ?? []
    if (strong.length) { add('Sanctions', `${p.name}`, 'fail', `Strong match: ${strong.map(m => `${m.entry.name} (${m.entry.regime})`).join('; ')}`); high.push(`${p.name} closely matches the UK Sanctions List — do not proceed until resolved`) }
    else if (possible.length) { add('Sanctions', `${p.name}`, 'review', `Possible match: ${possible.map(m => `${m.entry.name} (${m.entry.id})`).join('; ')} — confirm it is a different person`); medium.push(`${p.name} has a possible sanctions name match to rule out`) }
    else add('Sanctions', `${p.name}`, 'pass', `No match on the UK Sanctions List (${p.screening?.listDate})`)
  }

  // ── PEPs (reg 35) ────────────────────────────────────────────────────────
  const pepAnswers: [string, string, string][] = [[people[0]?.name ?? 'Landlord', str(f, 'pep'), str(f, 'pep_details')]]
  if (joint) pepAnswers.push([people[1].name, str(f, 'j_pep'), str(f, 'j_pep_details')])
  for (const [who, ans, det] of pepAnswers) {
    if (ans === 'yes') { add('PEP', who, 'fail', `Declared politically exposed: ${det || 'no details'}. Enhanced due diligence and senior approval required (reg 35).`); high.push(`${who} is a politically exposed person — enhanced due diligence required`) }
    else if (ans === 'no') add('PEP', who, 'pass', 'Declared not politically exposed')
    else add('PEP', who, 'review', 'Not answered')
  }

  // ── Beneficial ownership / third parties (reg 28(4)) ──────────────────────
  if (f.acting_for_other === 'yes') { add('Beneficial ownership', 'Acting for another person', 'fail', str(f, 'acting_for_details') || 'No details given'); high.push('Property is held for, or benefits, another person — identify and verify them') }
  else add('Beneficial ownership', 'Acting for another person', f.acting_for_other === 'no' ? 'pass' : 'review', f.acting_for_other === 'no' ? 'Declared no other owner or beneficiary' : 'Not answered')
  if (company) {
    add('Beneficial ownership', 'Directors and 25%+ owners listed', str(f, 'directors') ? 'review' : 'fail', 'Check against the Companies House register (and PSC register) and report any discrepancy')
    medium.push('Company landlord — confirm beneficial owners on Companies House')
    const office = str(f, 'registered_office').toLowerCase()
    if (inList(office, HIGH_RISK_CORPORATE)) { add('Geography', 'Company jurisdiction', 'fail', 'Registered in a jurisdiction HMRC treats as higher risk'); high.push('Company registered in a higher-risk jurisdiction') }
  }

  // ── Source of funds ──────────────────────────────────────────────────────
  const sof = str(f, 'source_of_funds')
  if (!sof) add('Source of funds', 'How the property was funded', 'review', 'Not answered')
  else if (['gift', 'other', 'business_income'].includes(sof)) { add('Source of funds', 'How the property was funded', 'review', `${sof.replace(/_/g, ' ')}: ${str(f, 'source_of_funds_details')} — consider asking for supporting evidence`); medium.push('Source of funds should be evidenced') }
  else add('Source of funds', 'How the property was funded', 'pass', `${sof.replace(/_/g, ' ')}: ${str(f, 'source_of_funds_details')}`)

  // ── Geography ────────────────────────────────────────────────────────────
  const residence = str(f, 'country_of_residence')
  if (residence && !UK.test(residence)) {
    const hr = inList(residence, HIGH_RISK_COUNTRIES)
    add('Geography', 'Country of residence', hr ? 'fail' : 'review', `${residence}${hr ? ' — listed by HMRC as higher risk' : ' — overseas landlord'}`)
    ;(hr ? high : medium).push(hr ? `Resident in a higher-risk country (${residence})` : `Overseas landlord (${residence}) — check NRL status`)
  } else add('Geography', 'Country of residence', 'pass', residence || 'United Kingdom')
  for (const p of people) {
    if (p.nationality && inList(p.nationality, HIGH_RISK_COUNTRIES)) add('Geography', `${p.name}: nationality`, 'review', `${p.nationality} — a geographic risk factor to consider alongside the rest of the file (not decisive on its own)`)
  }
  if (f.uk_resident === 'no') { add('Tax', 'Non-resident landlord', 'review', `NRL reference: ${str(f, 'nrl_ref') || 'not given'}`); medium.push('Non-resident landlord — NRL scheme applies') }

  // ── Delivery channel ─────────────────────────────────────────────────────
  add('Delivery channel', 'Onboarded remotely (no face-to-face meeting)', 'review', 'HMRC treats remote onboarding as a higher-risk factor; mitigated by document checks and sanctions screening')

  const suggested: AutomatedReview['suggested_level'] = high.length ? 'high' : medium.length ? 'medium' : 'low'
  const review: AutomatedReview = {
    generated_at: now.toISOString(),
    suggested_level: suggested,
    reasons: [...high, ...medium],
    checks,
    people,
    documents: readings,
    sanctions_list_date: people.find(p => p.screening)?.screening?.listDate,
  }

  await svc().from('landlord_onboarding')
    .update({ form_data: { ...f, __review: review }, updated_at: now.toISOString() })
    .eq('id', onboardingId)
  return review
}

export async function notifyOfficeOfSubmission(onboardingId: string, review: AutomatedReview | null) {
  const { data: row } = await svc().from('landlord_onboarding').select('full_name, email').eq('id', onboardingId).single()
  if (!row) return
  const biz = await fetchPDFBizSettings()
  const to = process.env.ONBOARDING_NOTIFY_EMAIL || biz.email
  const base = process.env.NEXT_PUBLIC_APP_URL ?? 'https://cros-sigma.vercel.app'
  const level = review?.suggested_level
  const colour = level === 'high' ? '#b91c1c' : level === 'medium' ? '#b45309' : '#15803d'
  const reasons = review?.reasons.slice(0, 8).map(r => `<li>${r}</li>`).join('') ?? ''
  await sendEmail(
    to,
    `AML form submitted — ${row.full_name}${level ? ` (suggested ${level} risk)` : ''}`,
    `<p style="margin:0 0 14px;font-size:15px;color:#333">${row.full_name} (${row.email}) has submitted their landlord onboarding and AML form.</p>
     ${level ? `<p style="margin:0 0 10px;font-size:15px"><strong>Suggested risk: <span style="color:${colour}">${level.toUpperCase()}</span></strong></p>` : '<p>The automatic checks could not run — open the record to run them.</p>'}
     ${reasons ? `<ul style="margin:0 0 14px;padding-left:18px;font-size:14px;color:#333">${reasons}</ul>` : ''}
     <p style="margin:0 0 14px;font-size:14px;color:#333">Review the documents and checks, confirm the risk level, then generate the AML report.</p>
     <p><a href="${base}/admin/new-business/onboarding/${onboardingId}" style="display:inline-block;background:#111;color:#fff;padding:10px 18px;border-radius:8px;text-decoration:none;font-size:14px">Open the review</a></p>`,
  )
}
