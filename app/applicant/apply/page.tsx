'use client'

// The application form an invited applicant fills in (the "Invite to apply" link). Look: the shared public frame
// (components/public/PublicShell, design "C"). ?edit=<applicant id> reopens a sent application (from its thank-you
// page) — loaded only with the email it was sent with, and only while we haven't moved it on — and sending it again
// updates the same application.
import NameInput, { emptyName, toFullName, parseFullName } from '@/app/components/NameInput'
import { useState, useEffect } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import PublicShell from '@/components/public/PublicShell'

interface PreviousAddress {
  address: string
  movedIn: string
  movedOut: string
  reasonLeft: string
}

const STANDARD = [
  'You leave all communal spaces — kitchen, bathrooms, hallways, lounge — as you found them',
  'You clear up after yourself without needing to be reminded',
  'You try to resolve small issues yourself before reporting — and know when a professional is needed',
  'You contribute fairly to communal supplies and shared upkeep',
  'You understand the cleaner is here for deep cleans, not day-to-day tidying',
  'When something isn\'t right, you raise it calmly and directly',
]
const ROMAN = ['i', 'ii', 'iii', 'iv', 'v', 'vi', 'vii', 'viii', 'ix']
const emailKey = (id: string) => `cr-apply-email-${id}`

// Small pieces in the house style — declared out here, never inside the form, so typing never remounts a field
function Choice({ on, onClick, children, square }: { on: boolean; onClick: () => void; children: React.ReactNode; square?: boolean }) {
  return (
    <button type="button" className="pub-choice" onClick={onClick} aria-pressed={on}>
      <span className={`pub-dot ${on ? 'on' : ''} ${square ? 'sq' : ''}`} />
      <span>{children}</span>
    </button>
  )
}
function Section({ n, title, id, children }: { n: number; title: string; id: string; children: React.ReactNode }) {
  return (
    <section id={id} className="pub-rise flex flex-col gap-5 pt-16">
      <h2 className="pub-h2"><i>{ROMAN[n - 1]}.</i>{title}</h2>
      {children}
    </section>
  )
}

export default function ApplicantForm() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const roomId = searchParams.get('roomId')
  const propertyId = searchParams.get('propertyId')
  const fastTrack = searchParams.get('fasttrack') === '1'
  const editId = searchParams.get('edit')

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)

  // Reopening a sent application
  const [editState, setEditState] = useState<'none' | 'need-email' | 'loading' | 'ready' | 'refused'>(editId ? 'loading' : 'none')
  const [editEmail, setEditEmail] = useState('')
  const [editMsg, setEditMsg] = useState('')

  // Personal info
  const [salutation, setSalutation] = useState('')
  const [firstName, setFirstName] = useState('')
  const [middleName, setMiddleName] = useState('')
  const [lastName, setLastName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [dateOfBirth, setDateOfBirth] = useState('')

  // Current situation
  const [currentAddress, setCurrentAddress] = useState('')
  const [profession, setProfession] = useState('')
  const [salary, setSalary] = useState('')
  const [linkedinUrl, setLinkedinUrl] = useState('')

  // Rental preferences
  const [preferredStartDate, setPreferredStartDate] = useState('')
  const [preferredTerm, setPreferredTerm] = useState('12 months')

  // Tell Us About Yourself
  const [bio, setBio] = useState('')
  const [interests, setInterests] = useState('')
  const [professionDescription, setProfessionDescription] = useState('')

  // What Are You Like to Live With
  const [sociability, setSociability] = useState('flexible')
  const [housePreferences, setHousePreferences] = useState('')
  const [communicationStyle, setCommunicationStyle] = useState('')

  // About This Room
  const [roomRequirements, setRoomRequirements] = useState('')
  const [roomConditions, setRoomConditions] = useState('')

  // Rent
  const [advertiserRent, setAdvertisedRent] = useState<number | null>(null)
  // the room's asking rent — for the rent question, the affordability check and the guarantor figures
  useEffect(() => {
    if (!roomId) return
    fetch(`/api/applicant/room/${roomId}`).then(r => (r.ok ? r.json() : null)).then(d => { if (d?.monthly) setAdvertisedRent(Number(d.monthly)) }).catch(() => {})
  }, [roomId])
  const [rentOfferType, setRentOfferType] = useState('asking') // 'asking' or 'below_asking'
  const [offeredRent, setOfferedRent] = useState<number | null>(null)

  // Rental history
  const [previousAddresses, setPreviousAddresses] = useState<PreviousAddress[]>([
    { address: '', movedIn: '', movedOut: '', reasonLeft: '' },
  ])

  // Privacy & consent
  const [privacyConsent, setPrivacyConsent] = useState(false)

  // House standards pre-screening
  const [standardsAgreed, setStandardsAgreed] = useState(false)

  // Student route
  const [isStudent, setIsStudent] = useState(false)
  const [university, setUniversity] = useState('')
  const [courseStudied, setCourseStudied] = useState('')
  const [studyYear, setStudyYear] = useState('')
  const [guarantorConfirmed, setGuarantorConfirmed] = useState(false)

  // Guarantor (Homeppl's affordability: yearly income 30 × the monthly rent, or savings of 36 × held for 3 months;
  // a guarantor needs 36 × the monthly rent a year)
  const [guarantorNeeded, setGuarantorNeeded] = useState<'' | 'no' | 'yes' | 'not_sure'>('')
  const [guarantorName, setGuarantorName] = useState('')
  const [guarantorNm, setGuarantorNm] = useState(emptyName())
  const [guarantorEmail, setGuarantorEmail] = useState('')
  const [guarantorPhone, setGuarantorPhone] = useState('')

  useEffect(() => {
    if (!roomId || !propertyId) {
      setError('Invalid application link. Missing room or property ID.')
    }
  }, [roomId, propertyId])

  // Reopen: load what was sent, using the email remembered from the thank-you page (or typed in)
  async function loadForEdit(withEmail: string) {
    if (!editId) return
    setEditState('loading'); setEditMsg('')
    try {
      const res = await fetch('/api/applicant/application', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ applicantId: editId, email: withEmail.trim() }),
      })
      const d = await res.json().catch(() => ({}))
      if (res.status === 403 || res.status === 409) { setEditState('refused'); setEditMsg(d.error || 'This application can no longer be changed online.'); return }
      if (!res.ok) { setEditState('need-email'); setEditMsg(d.error || 'That email doesn’t match the application.'); return }
      const a = d.application
      setSalutation(a.salutation ?? ''); setFirstName(a.first_name ?? ''); setMiddleName(a.middle_name ?? ''); setLastName(a.last_name ?? '')
      setEmail(a.email ?? ''); setPhone(a.phone ?? ''); setDateOfBirth(a.date_of_birth ?? ''); setCurrentAddress(a.current_address ?? '')
      setProfession(a.profession ?? ''); setSalary(a.salary ?? ''); setLinkedinUrl(a.linkedin_url ?? ''); setProfessionDescription(a.profession_description ?? '')
      setPreferredStartDate(a.preferred_start_date ?? ''); setPreferredTerm(a.preferred_term ?? '12 months')
      setBio(a.bio ?? ''); setInterests(a.interests ?? ''); setSociability(a.sociability ?? 'flexible')
      setHousePreferences(a.house_preferences ?? ''); setCommunicationStyle(a.communication_style ?? '')
      setRoomRequirements(a.room_requirements ?? ''); setRoomConditions(a.room_conditions ?? '')
      setRentOfferType(a.rent_offer_type === 'below_asking' ? 'below_asking' : 'asking'); setOfferedRent(a.offered_rent ? Number(a.offered_rent) : null)
      if (Array.isArray(a.previous_addresses) && a.previous_addresses.length) setPreviousAddresses(a.previous_addresses)
      if (a.guarantor_needed) setGuarantorNeeded(a.guarantor_needed)
      if (a.guarantor_name) { setGuarantorName(a.guarantor_name); setGuarantorNm(parseFullName(a.guarantor_name)) }
      setGuarantorEmail(a.guarantor_email ?? ''); setGuarantorPhone(a.guarantor_phone ?? '')
      setStandardsAgreed(true)
      try { sessionStorage.setItem(emailKey(editId), a.email ?? withEmail) } catch { /* private mode */ }
      setEditState('ready')
    } catch {
      setEditState('need-email'); setEditMsg('We couldn’t load your application. Please check your connection and try again.')
    }
  }
  useEffect(() => {
    if (!editId) return
    let remembered = ''
    try { remembered = sessionStorage.getItem(emailKey(editId)) ?? '' } catch { /* private mode */ }
    if (remembered) loadForEdit(remembered)
    else setEditState('need-email')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editId])

  const addPreviousAddress = () => {
    setPreviousAddresses([
      ...previousAddresses,
      { address: '', movedIn: '', movedOut: '', reasonLeft: '' },
    ])
  }

  const updatePreviousAddress = (
    index: number,
    field: keyof PreviousAddress,
    value: string
  ) => {
    const updated = [...previousAddresses]
    updated[index][field] = value
    setPreviousAddresses(updated)
  }

  const removePreviousAddress = (index: number) => {
    setPreviousAddresses(previousAddresses.filter((_, i) => i !== index))
  }

  // Parse the lower bound of a salary string like "£35,000 - £40,000" or "35000"
  const parseSalaryLow = (str: string): number | null => {
    const cleaned = str.replace(/[£,\s]/g, '')
    const match = cleaned.match(/(\d+)/)
    if (!match) return null
    const val = parseInt(match[1], 10)
    return val < 1000 ? val * 1000 : val
  }

  const getAffordability = () => {
    if (isStudent) return { status: 'student' as const }
    if (!advertiserRent) return { status: 'unknown' as const }
    const parsedSalary = parseSalaryLow(salary)
    if (!parsedSalary) return { status: 'unknown' as const }
    const rent = rentOfferType === 'below_asking' && offeredRent ? offeredRent : advertiserRent
    const minSalary = rent * 30
    const minSavings = rent * 36
    const guarantorMinSalary = rent * 36
    const fmt = (n: number) => `£${Math.round(n).toLocaleString()}`
    if (parsedSalary >= minSalary) {
      return {
        status: 'pass' as const,
        message: `✓ Your salary meets standard referencing criteria (${fmt(minSalary)}/yr minimum).`,
      }
    }
    if (parsedSalary >= Math.round(minSalary * 0.8)) {
      return {
        status: 'borderline' as const,
        message: `Your salary is slightly below the usual threshold of ${fmt(minSalary)}/yr. You may be asked to show savings of ${fmt(minSavings)} (held for at least 3 months) or to add a UK guarantor earning at least ${fmt(guarantorMinSalary)}/yr.`,
        minSavings: fmt(minSavings),
        guarantorMinSalary: fmt(guarantorMinSalary),
      }
    }
    return {
      status: 'fail' as const,
      message: `Based on the salary entered, you are unlikely to pass standard referencing for this room (threshold: ${fmt(minSalary)}/yr). To proceed you will need one of the following:`,
      options: [
        `Savings of ${fmt(minSavings)}, held for at least 3 months`,
        `A UK-based guarantor earning at least ${fmt(guarantorMinSalary)}/yr`,
      ],
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    // Validate required fields
    if (!salutation || !firstName.trim() || !lastName.trim() || !email || !profession || !bio) {
      setError('Please fill in all required fields')
      setLoading(false)
      return
    }

    // Guarantor: asked of everyone; details needed when they'll use one (students always)
    const needsGuarantorDetails = guarantorNeeded === 'yes' || isStudent
    if (!guarantorNeeded && !isStudent) {
      setError('Please tell us whether you will need a guarantor')
      setLoading(false)
      return
    }
    if (needsGuarantorDetails && (!guarantorNm.salutation || !guarantorNm.first_name.trim() || !guarantorNm.last_name.trim() || !guarantorPhone.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(guarantorEmail.trim()))) {
      setError('Please add your guarantor’s full name, mobile number and email address')
      setLoading(false)
      return
    }

    // Validate standards agreement
    if (!standardsAgreed) {
      setError('Please confirm you meet the Capital Rooms house standard before applying')
      setLoading(false)
      return
    }

    // Validate privacy consent
    if (!privacyConsent) {
      setError('You must accept the privacy policy to continue')
      setLoading(false)
      return
    }

    try {
      const response = await fetch('/api/applicant/apply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fullName: [firstName, middleName, lastName].map(x => x.trim()).filter(Boolean).join(' '),
          salutation, firstName: firstName.trim(), middleName: middleName.trim(), lastName: lastName.trim(),
          email,
          phone,
          dateOfBirth,
          currentAddress,
          profession,
          salary,
          linkedinUrl,
          professionDescription,
          preferredStartDate,
          preferredTerm,
          bio,
          interests,
          sociability,
          housePreferences,
          communicationStyle,
          roomRequirements,
          roomConditions,
          rentOfferType,
          advertisedRent: advertiserRent,
          offeredRent: rentOfferType === 'below_asking' ? offeredRent : null,
          previousAddresses: previousAddresses.filter((a) => a.address.trim()),
          roomId,
          propertyId,
          guarantorNeeded: isStudent ? 'yes' : guarantorNeeded,
          guarantorName: needsGuarantorDetails ? guarantorName : '',
          guarantorEmail: needsGuarantorDetails ? guarantorEmail : '',
          guarantorPhone: needsGuarantorDetails ? guarantorPhone : '',
          // reopened: update this application (checked against the email it was loaded with)
          ...(editId && editState === 'ready' ? { editingId: editId, editingEmail: (() => { try { return sessionStorage.getItem(emailKey(editId)) ?? '' } catch { return '' } })() } : {}),
        }),
      })

      const result = await response.json()

      if (!response.ok) {
        setError(result.error || 'Failed to submit application')
        setLoading(false)
        return
      }

      // remember the email for this application so "Reopen my application" can load it again on this device
      try { if (result.applicantId) sessionStorage.setItem(emailKey(result.applicantId), email.trim()) } catch { /* private mode */ }
      setSuccess(true)
      setLoading(false)
      window.scrollTo(0, 0)

      // Fast-track: go straight to reserve page. Standard: show review first.
      setTimeout(() => {
        if (fastTrack && roomId && propertyId) {
          // &a= lets the reserve page's "I've paid" button say who it is
          router.push(`/applicant/reserve?roomId=${roomId}&propertyId=${propertyId}${result.applicantId ? `&a=${result.applicantId}` : ''}`)
        } else {
          router.push(`/applicant/review?applicantId=${result.applicantId}`)
        }
      }, 1600)
    } catch (err) {
      setError('An error occurred. Please try again.')
      setLoading(false)
    }
  }

  const wrap = 'mx-auto max-w-6xl px-6 md:px-14'

  if (!roomId || !propertyId) {
    return (
      <PublicShell label="Application">
        <section className={`${wrap} py-20`}>
          <h1 className="pub-serif m-0 text-[44px] leading-tight">This link isn’t complete</h1>
          <p className="m-0 mt-4 max-w-xl text-[16px] pub-muted">This application link is missing required information. Please check the link and try again.</p>
        </section>
      </PublicShell>
    )
  }

  if (success) {
    return (
      <PublicShell label="Application">
        <section className={`${wrap} py-24`}>
          <p className="pub-serif pub-display pub-enter m-0">Sent.</p>
          <p className="m-0 mt-6 text-[18px] pub-muted">
            {fastTrack ? 'Taking you to secure the room now…' : 'Thank you — we’ve received your details. Taking you to the next page…'}
          </p>
        </section>
      </PublicShell>
    )
  }

  // Reopening: confirm who you are first
  if (editId && editState !== 'ready' && editState !== 'none') {
    return (
      <PublicShell label="Application">
        <section className={`${wrap} py-16 md:py-24`}>
          <h1 className="pub-serif pub-display m-0">Reopen your <span className="italic">application</span></h1>
          {editState === 'loading' && <p className="m-0 mt-8 text-[17px] pub-muted">Loading your answers…</p>}
          {editState === 'refused' && (
            <div className="mt-8 flex max-w-xl flex-col gap-4">
              <p className="m-0 text-[17px]">{editMsg}</p>
              <p className="m-0 text-[15px] pub-muted">Email <a className="pub-link" href="mailto:management@capitalrooms.co.uk">management@capitalrooms.co.uk</a> with anything you’d like to change and we’ll update it for you.</p>
            </div>
          )}
          {editState === 'need-email' && (
            <form onSubmit={e => { e.preventDefault(); loadForEdit(editEmail) }} className="mt-8 flex max-w-xl flex-col gap-6">
              <p className="m-0 text-[16px] pub-muted">To keep your details private, enter the email address you applied with.</p>
              <label className="pub-label">Email
                <input className="pub-input" type="email" required value={editEmail} onChange={e => setEditEmail(e.target.value)} placeholder="your@email.com" />
              </label>
              {editMsg && <p className="pub-error">{editMsg}</p>}
              <button type="submit" className="pub-btn self-start">Open my application</button>
            </form>
          )}
        </section>
      </PublicShell>
    )
  }

  const guarantorFigures = (() => {
    const rent = rentOfferType === 'below_asking' && offeredRent ? offeredRent : advertiserRent
    const fmt = (n: number) => `£${Math.round(n).toLocaleString('en-GB')}`
    return {
      income: rent ? fmt(rent * 30) : '30 × the monthly rent',
      savings: rent ? fmt(rent * 36) : '36 × the monthly rent',
      gIncome: rent ? fmt(rent * 36) : '36 × the monthly rent',
    }
  })()
  const showGuarantorDetails = guarantorNeeded === 'yes' || isStudent
  const aff = getAffordability()

  return (
    <PublicShell label={editState === 'ready' ? 'Editing your application' : 'Application'}>
      {/* Greeting */}
      <section className={`${wrap} pt-10 md:pt-14`}>
        <h1 className="pub-serif pub-display pub-enter m-0">
          <span className="pub-drift-l block">Tell us about</span>
          <span className="pub-drift-r block italic">yourself.</span>
        </h1>
        <p className="pub-enter-2 m-0 mt-6 max-w-2xl text-[18px] leading-relaxed" style={{ color: '#4A4741' }}>
          {editState === 'ready'
            ? 'Your answers are all here. Change what you need, then send it again — it reaches us as an update to the same application.'
            : 'Help us understand if this is a great fit. This should take less than 5 minutes.'}
        </p>
      </section>

      {/* The Capital Rooms Standard — pre-screening gate */}
      <section className={`${wrap} pt-12`}>
        <div className="pub-rise flex flex-col gap-5 p-6 md:p-10" style={{ background: '#111', color: '#F3F0EA' }}>
          <h2 className="pub-serif m-0 text-[32px] leading-tight md:text-[40px]">The Capital Rooms Standard</h2>
          <p className="m-0 max-w-3xl text-[15px] leading-relaxed" style={{ color: '#C9C4BA' }}>
            Shared living works best when everyone plays their part. Our houses attract people who are naturally considerate and self-motivated — the kind of housemates others genuinely enjoy living with.
          </p>
          <ul className="m-0 grid list-none gap-3 p-0 md:grid-cols-2 md:gap-x-10">
            {STANDARD.map((item, i) => (
              <li key={item} className="flex gap-3 text-[14.5px] leading-relaxed">
                <span className="pub-serif italic" style={{ color: '#C9B48E' }}>{ROMAN[i]}.</span>{item}
              </li>
            ))}
          </ul>
          <p className="m-0 text-[14px]" style={{ color: '#C9C4BA' }}>If this sounds like you, we think you’ll fit right in.</p>
          <button type="button" onClick={() => setStandardsAgreed(!standardsAgreed)} aria-pressed={standardsAgreed}
            className="flex min-h-[52px] items-center gap-3 px-4 text-left text-[15px]"
            style={{ border: '1px solid #F3F0EA', background: standardsAgreed ? '#F3F0EA' : 'transparent', color: standardsAgreed ? '#111' : '#F3F0EA' }}>
            <span aria-hidden="true">{standardsAgreed ? '✓' : '○'}</span>
            This sounds like me — I’m ready to be a great housemate.
          </button>
        </div>
      </section>

      <form onSubmit={handleSubmit} className={`${wrap} pb-20`}>
        <div className="mx-auto max-w-3xl">
          <Section n={1} id="a1" title="Personal information">
            <NameInput
              value={{ salutation, first_name: firstName, middle_name: middleName, last_name: lastName }}
              onChange={n => { setSalutation(n.salutation); setFirstName(n.first_name); setMiddleName(n.middle_name ?? ''); setLastName(n.last_name) }}
              required titleRequired withMiddle
              inputClass="pub-input"
              labelClass="pub-label mb-1"
            />
            <p className="m-0 -mt-2 text-[13px] pub-muted">Your full legal name, as on your passport or ID — it goes on your tenancy agreement.</p>
            <label className="pub-label">Email *
              <input className="pub-input" type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="your@email.com" required />
            </label>
            <div className="grid gap-5 md:grid-cols-2">
              <label className="pub-label">Phone
                <input className="pub-input" type="tel" value={phone} onChange={e => setPhone(e.target.value)} placeholder="+44 7700 900000" />
              </label>
              <label className="pub-label">Date of birth
                <input className="pub-input" type="date" value={dateOfBirth} onChange={e => setDateOfBirth(e.target.value)} />
              </label>
            </div>
            <label className="pub-label">Current address
              <input className="pub-input" type="text" value={currentAddress} onChange={e => setCurrentAddress(e.target.value)} placeholder="Where do you live now?" />
            </label>
          </Section>

          <Section n={2} id="a2" title="Work & finances">
            <button type="button" role="switch" aria-checked={isStudent} onClick={() => setIsStudent(!isStudent)} className={`pub-pill self-start ${isStudent ? 'on' : ''}`}>
              I’m a student · {isStudent ? 'Yes' : 'No'}
            </button>
            <label className="pub-label">Profession{!isStudent && ' *'}
              <input className="pub-input" type="text" value={profession} onChange={e => setProfession(e.target.value)}
                placeholder={isStudent ? 'e.g., Student, Part-time barista' : 'e.g., Software Engineer, Marketing Manager'} required={!isStudent} />
            </label>
            {isStudent ? (
              <>
                <div className="grid gap-5 md:grid-cols-2">
                  <label className="pub-label">University
                    <input className="pub-input" type="text" value={university} onChange={e => setUniversity(e.target.value)} placeholder="e.g., University of London" />
                  </label>
                  <label className="pub-label">Year of study
                    <select className="pub-input" value={studyYear} onChange={e => setStudyYear(e.target.value)}>
                      <option value="">Select year</option>
                      {['1st year', '2nd year', '3rd year', '4th year', 'Masters', 'PhD', 'Foundation'].map(y => <option key={y} value={y}>{y}</option>)}
                    </select>
                  </label>
                </div>
                <label className="pub-label">Course / Subject
                  <input className="pub-input" type="text" value={courseStudied} onChange={e => setCourseStudied(e.target.value)} placeholder="e.g., Computer Science, Business Management" />
                </label>
                <div className="pub-note flex flex-col gap-2">
                  <span>Student applications require a UK guarantor earning at least <strong>£{advertiserRent ? Math.round(advertiserRent * 36).toLocaleString('en-GB') : '---'}/yr</strong>. This is typically a parent or guardian.</span>
                  <Choice square on={guarantorConfirmed} onClick={() => setGuarantorConfirmed(!guarantorConfirmed)}>I have a UK guarantor who can meet this requirement</Choice>
                </div>
              </>
            ) : (
              <label className="pub-label">Salary (annual)
                <input className="pub-input" type="text" value={salary} onChange={e => setSalary(e.target.value)} placeholder="e.g., £35,000 - £40,000" />
              </label>
            )}
            <label className="pub-label">LinkedIn profile (optional)
              <input className="pub-input" type="url" value={linkedinUrl} onChange={e => setLinkedinUrl(e.target.value)} placeholder="https://linkedin.com/in/yourprofile" />
            </label>
          </Section>

          <Section n={3} id="a3" title="About you">
            <p className="m-0 text-[15px] leading-relaxed" style={{ color: '#4A4741' }}>
              We share this with the landlord. If you take the room, we also send your future housemates a short hello
              (your first name, what you do and your interests), never your surname, contact or financial details.
            </p>
            <label className="pub-label">Bio *
              <textarea className="pub-input" value={bio} onChange={e => setBio(e.target.value)} placeholder="Who are you? What do you do? (2-3 sentences)" required />
            </label>
            <label className="pub-label">Tell us more about your career
              <textarea className="pub-input" value={professionDescription} onChange={e => setProfessionDescription(e.target.value)} placeholder="What do you do day-to-day? What are you passionate about in your work?" />
            </label>
            <label className="pub-label">Interests &amp; hobbies
              <input className="pub-input" type="text" value={interests} onChange={e => setInterests(e.target.value)} placeholder="e.g., cooking, gaming, outdoor activities, reading" />
            </label>
          </Section>

          <Section n={4} id="a4" title="What are you like to live with?">
            <p className="pub-label m-0">How would you describe yourself?</p>
            <div className="flex flex-wrap gap-2">
              {(['sociable', 'flexible', 'keep-to-self'] as const).map(o => (
                <button key={o} type="button" onClick={() => setSociability(o)} aria-pressed={sociability === o} className={`pub-pill ${sociability === o ? 'on' : ''}`}>
                  {o === 'keep-to-self' ? 'Keep to Myself' : o.charAt(0).toUpperCase() + o.slice(1)}
                </button>
              ))}
            </div>
            <label className="pub-label">What’s important to you in a shared house?
              <textarea className="pub-input" value={housePreferences} onChange={e => setHousePreferences(e.target.value)} placeholder="e.g., quiet hours, cleanliness, cooking together, regular house meetings" />
            </label>
            <label className="pub-label">How do you prefer to communicate and resolve issues?
              <textarea className="pub-input" value={communicationStyle} onChange={e => setCommunicationStyle(e.target.value)} placeholder="e.g., direct conversations, house meetings, group chat" />
            </label>
          </Section>

          <Section n={5} id="a5" title="About this room">
            <label className="pub-label">What do you need in this room?
              <textarea className="pub-input" value={roomRequirements} onChange={e => setRoomRequirements(e.target.value)} placeholder="e.g., natural light, quiet, space for WFH, double bed fit, storage" />
            </label>
            <label className="pub-label">Any specific conditions based on what you’ve seen?
              <textarea className="pub-input" value={roomConditions} onChange={e => setRoomConditions(e.target.value)} placeholder="e.g., needs accommodation for two people, needs to fit my equipment, concerned about noise from street" />
            </label>
          </Section>

          <Section n={6} id="a6" title="About the rent">
            <p className="m-0 text-[16px]">
              The advertised rent for this room is <span className="pub-serif text-[28px]">£{advertiserRent ? advertiserRent.toFixed(0) : '---'}</span>/month <span className="pub-muted">(all bills included)</span>
            </p>
            <p className="pub-label m-0">Your offer</p>
            <div>
              <Choice on={rentOfferType === 'asking'} onClick={() => setRentOfferType('asking')}>Yes, I’m offering the advertised rent (£{advertiserRent ? advertiserRent.toFixed(0) : '---'})</Choice>
              <Choice on={rentOfferType === 'below_asking'} onClick={() => setRentOfferType('below_asking')}>I’d like to make an offer below asking price</Choice>
            </div>
            {rentOfferType === 'below_asking' && (
              <label className="pub-label max-w-xs">Your offer amount (£/month)
                <input className="pub-input" type="number" value={offeredRent || ''} onChange={e => setOfferedRent(e.target.value ? parseFloat(e.target.value) : null)} placeholder="e.g., 800" />
              </label>
            )}
            {(aff.status === 'pass' || aff.status === 'borderline' || aff.status === 'fail') && (
              <div className="pub-note flex flex-col gap-2" style={{ borderLeft: `2px solid ${aff.status === 'pass' ? '#2F6B45' : aff.status === 'borderline' ? '#A86A12' : '#9B2C1F'}` }}>
                <strong>Referencing check</strong>
                <span>{aff.message}</span>
                {aff.status === 'fail' && 'options' in aff && (
                  <ul className="m-0 pl-5">{aff.options.map((o: string) => <li key={o}>{o}</li>)}</ul>
                )}
                {(aff.status === 'fail' || aff.status === 'borderline') && (
                  <span className="text-[13px] pub-muted">Salary threshold: 30× monthly rent. Savings: 36× monthly rent, held 3 months. Guarantor: 36× monthly rent a year. You can still submit your application — our team will be in touch about next steps.</span>
                )}
              </div>
            )}
          </Section>

          <Section n={7} id="a7" title={`Will you need a guarantor?${isStudent ? '' : ' *'}`}>
            <p className="m-0 text-[15px] leading-relaxed" style={{ color: '#4A4741' }}>
              To pass referencing for this room you’ll need to show <strong>earnings of at least {guarantorFigures.income} a year</strong>, or <strong>savings of at least {guarantorFigures.savings}</strong> held for 3 months or more.
              If not, a UK guarantor earning at least <strong>{guarantorFigures.gIncome} a year</strong> can support your application.
            </p>
            {isStudent ? (
              <p className="m-0 text-[15px]">As a student you’ll need a guarantor — please add their details below.</p>
            ) : (
              <div>
                {([
                  ['no', `No — I earn ${guarantorFigures.income}+ a year or have ${guarantorFigures.savings}+ in savings`],
                  ['yes', 'Yes — I’ll have a guarantor'],
                  ['not_sure', 'Not sure yet'],
                ] as const).map(([v, l]) => (
                  <Choice key={v} on={guarantorNeeded === v} onClick={() => setGuarantorNeeded(v)}>{l}</Choice>
                ))}
              </div>
            )}
            {showGuarantorDetails && (
              <div className="flex flex-col gap-5 pt-2">
                <NameInput value={guarantorNm} onChange={n => { setGuarantorNm(n); setGuarantorName(toFullName(n)) }} required titleRequired withMiddle label="Guarantor’s full name" inputClass="pub-input" labelClass="pub-label mb-1" />
                <div className="grid gap-5 md:grid-cols-2">
                  <label className="pub-label">Mobile *
                    <input className="pub-input" type="tel" value={guarantorPhone} onChange={e => setGuarantorPhone(e.target.value)} autoComplete="off" />
                  </label>
                  <label className="pub-label">Email *
                    <input className="pub-input" type="email" value={guarantorEmail} onChange={e => setGuarantorEmail(e.target.value)} autoComplete="off" />
                  </label>
                </div>
                <p className="m-0 text-[13px] pub-muted">We’ll pass these to our referencing provider, Homeppl, who will contact your guarantor directly. Please let them know to expect it.</p>
              </div>
            )}
            {guarantorNeeded === 'not_sure' && !isStudent && <p className="m-0 text-[15px] pub-muted">That’s fine — we’ll talk it through with you before referencing starts.</p>}
          </Section>

          <Section n={8} id="a8" title="Rental preferences">
            <div className="grid gap-5 md:grid-cols-2">
              <label className="pub-label">Preferred start date
                <input className="pub-input" type="date" value={preferredStartDate} onChange={e => setPreferredStartDate(e.target.value)} />
              </label>
              <label className="pub-label">Preferred term
                <select className="pub-input" value={preferredTerm} onChange={e => setPreferredTerm(e.target.value)}>
                  <option value="6 months">6 months</option>
                  <option value="12 months">12 months</option>
                  <option value="flexible">Flexible</option>
                </select>
              </label>
            </div>
          </Section>

          <Section n={9} id="a9" title="Rental history">
            {previousAddresses.map((addr, idx) => (
              <div key={idx} className="flex flex-col gap-5" style={{ borderTop: idx ? '1px solid #E4E0D8' : undefined, paddingTop: idx ? 20 : 0 }}>
                <div className="flex items-center justify-between">
                  <span className="pub-label">Address {idx + 1}</span>
                  {previousAddresses.length > 1 && (
                    <button type="button" onClick={() => removePreviousAddress(idx)} className="text-[13px] underline">Remove</button>
                  )}
                </div>
                <input className="pub-input" type="text" placeholder="Address" aria-label={`Previous address ${idx + 1}`} value={addr.address} onChange={e => updatePreviousAddress(idx, 'address', e.target.value)} />
                <div className="grid grid-cols-2 gap-5">
                  <label className="pub-label">Moved in
                    <input className="pub-input" type="text" placeholder="e.g. Sept 2021" value={addr.movedIn} onChange={e => updatePreviousAddress(idx, 'movedIn', e.target.value)} />
                  </label>
                  <label className="pub-label">Moved out
                    <input className="pub-input" type="text" placeholder="e.g. March 2023" value={addr.movedOut} onChange={e => updatePreviousAddress(idx, 'movedOut', e.target.value)} />
                  </label>
                </div>
                <input className="pub-input" type="text" placeholder="Why did you leave?" aria-label="Why did you leave?" value={addr.reasonLeft} onChange={e => updatePreviousAddress(idx, 'reasonLeft', e.target.value)} />
              </div>
            ))}
            <button type="button" onClick={addPreviousAddress} className="pub-pill self-start">+ Add address</button>
          </Section>

          {/* Privacy & consent, then send */}
          <section className="flex flex-col gap-5 pt-16">
            <div style={{ borderTop: '1px solid #111' }}>
              <Choice square on={privacyConsent} onClick={() => setPrivacyConsent(!privacyConsent)}>
                <span className="font-semibold">I accept the privacy policy</span>
                <small>I understand that Capital Rooms will hold my data until my application is either accepted and progresses to tenancy, or rejected/withdrawn and deleted within 30 days.</small>
              </Choice>
            </div>
            <a className="pub-link text-[14px]" href="/applicant/privacy" target="_blank" rel="noopener noreferrer">Read full privacy policy →</a>
            {error && <p className="pub-error">{error}</p>}
            <button type="submit" disabled={loading || !privacyConsent} className="pub-btn self-start">
              {loading ? 'Sending…' : editState === 'ready' ? 'Send my updated application' : 'Submit application'}
            </button>
          </section>
        </div>
      </form>
    </PublicShell>
  )
}
