'use client'

import { useState, useEffect } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'

interface PreviousAddress {
  address: string
  movedIn: string
  movedOut: string
  reasonLeft: string
}

export default function ApplicantForm() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const roomId = searchParams.get('roomId')
  const propertyId = searchParams.get('propertyId')

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)

  // Personal info
  const [fullName, setFullName] = useState('')
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

  useEffect(() => {
    if (!roomId || !propertyId) {
      setError('Invalid application link. Missing room or property ID.')
    }
  }, [roomId, propertyId])

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
    const minSalary = advertiserRent * 30
    const minSavings = advertiserRent * 6
    const guarantorMinSalary = advertiserRent * 36
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
        message: `Your salary is slightly below the usual threshold of ${fmt(minSalary)}/yr. A referencing agent may approve it, but you may be asked for 6 months' rent in savings (${fmt(minSavings)}) or a UK guarantor earning at least ${fmt(guarantorMinSalary)}/yr.`,
        minSavings: fmt(minSavings),
        guarantorMinSalary: fmt(guarantorMinSalary),
      }
    }
    return {
      status: 'fail' as const,
      message: `Based on the salary entered, you are unlikely to pass standard referencing for this room (threshold: ${fmt(minSalary)}/yr). To proceed you will need one of the following:`,
      options: [
        `6 months' rent in savings — ${fmt(minSavings)}`,
        `A UK-based guarantor earning at least ${fmt(guarantorMinSalary)}/yr`,
      ],
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    // Validate required fields
    if (!fullName || !email || !profession || !bio) {
      setError('Please fill in all required fields')
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
          fullName,
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
          offeredRent: rentOfferType === 'below_asking' ? offeredRent : null,
          previousAddresses: previousAddresses.filter((a) => a.address.trim()),
          roomId,
          propertyId,
        }),
      })

      const result = await response.json()

      if (!response.ok) {
        setError(result.error || 'Failed to submit application')
        setLoading(false)
        return
      }

      setSuccess(true)
      setLoading(false)

      // Redirect to next step after 2 seconds
      setTimeout(() => {
        router.push(`/applicant/review?applicantId=${result.applicantId}`)
      }, 2000)
    } catch (err) {
      setError('An error occurred. Please try again.')
      setLoading(false)
    }
  }

  if (!roomId || !propertyId) {
    return (
      <div className="min-h-screen bg-neutral-100 flex items-center justify-center px-lg">
        <div className="bg-white rounded-lg p-lg border border-red-300 max-w-md">
          <h1 className="text-lg font-bold text-red-700 mb-sm">Invalid Link</h1>
          <p className="text-sm text-neutral-600">
            This application link is missing required information. Please check
            the link and try again.
          </p>
        </div>
      </div>
    )
  }

  if (success) {
    return (
      <div className="min-h-screen bg-neutral-100 flex items-center justify-center px-lg">
        <div className="bg-white rounded-lg p-lg border border-green-300 max-w-md text-center">
          <h1 className="text-lg font-bold text-green-700 mb-sm">
            ✓ Application Submitted
          </h1>
          <p className="text-sm text-neutral-600">
            Thank you! We've received your application. Redirecting to the next
            step...
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-neutral-100 py-xl px-lg">
      <div className="mx-auto max-w-2xl">
        {/* Header */}
        <div className="bg-white rounded-lg p-lg mb-lg border border-neutral-200">
          <h1 className="text-2xl font-bold text-neutral-900 mb-sm">
            Tell Us About Yourself
          </h1>
          <p className="text-sm text-neutral-600">
            Help us understand if this is a great fit. This should take less than 5 minutes.
          </p>
        </div>

        {/* The Capital Rooms Standard — pre-screening gate */}
        <div className="bg-neutral-900 text-white rounded-2xl p-lg mb-lg border border-neutral-800">
          <div className="flex items-center gap-sm mb-md">
            <span className="text-xl">🏡</span>
            <h2 className="text-lg font-bold tracking-tight">The Capital Rooms Standard</h2>
          </div>
          <p className="text-sm text-neutral-300 mb-md leading-relaxed">
            Shared living works best when everyone plays their part. Our houses attract
            people who are naturally considerate and self-motivated — the kind of
            housemates others genuinely enjoy living with.
          </p>
          <ul className="space-y-sm mb-md">
            {[
              'You leave all communal spaces — kitchen, bathrooms, hallways, lounge — as you found them',
              'You clear up after yourself without needing to be reminded',
              'You try to resolve small issues yourself before reporting — and know when a professional is needed',
              'You contribute fairly to communal supplies and shared upkeep',
              'You understand the cleaner is here for deep cleans, not day-to-day tidying',
              'When something isn\'t right, you raise it calmly and directly',
            ].map((item) => (
              <li key={item} className="flex items-start gap-sm text-sm text-neutral-200">
                <span className="text-green-400 mt-0.5 shrink-0">✓</span>
                <span>{item}</span>
              </li>
            ))}
          </ul>
          <p className="text-sm text-neutral-400 border-t border-neutral-700 pt-md mb-md">
            If this sounds like you, we think you&apos;ll fit right in.
          </p>
          <label className={`flex items-start gap-sm cursor-pointer p-md rounded-xl transition-colors ${standardsAgreed ? 'bg-green-900/40 border border-green-700' : 'bg-neutral-800 border border-neutral-700'}`}>
            <input
              type="checkbox"
              checked={standardsAgreed}
              onChange={(e) => setStandardsAgreed(e.target.checked)}
              className="mt-0.5 h-4 w-4 shrink-0 accent-green-500"
            />
            <span className="text-sm text-neutral-100 leading-snug">
              This sounds like me — I&apos;m ready to be a great housemate.
            </span>
          </label>
        </div>

        {error && (
          <div className="mb-lg p-lg rounded-lg bg-red-100 border border-red-300 text-red-900 text-sm">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-lg">
          {/* Personal Information */}
          <div className="bg-white rounded-lg p-lg border border-neutral-200">
            <h2 className="text-lg font-semibold text-neutral-900 mb-lg">
              Personal Information
            </h2>

            <div className="space-y-md">
              <div>
                <label className="block text-sm font-medium text-neutral-900 mb-xs">
                  Full Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="Your full name"
                  className="w-full px-md py-sm border border-neutral-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-neutral-900"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-neutral-900 mb-xs">
                  Email <span className="text-red-500">*</span>
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="your@email.com"
                  className="w-full px-md py-sm border border-neutral-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-neutral-900"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-md">
                <div>
                  <label className="block text-sm font-medium text-neutral-900 mb-xs">
                    Phone
                  </label>
                  <input
                    type="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="+44 7700 900000"
                    className="w-full px-md py-sm border border-neutral-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-neutral-900"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-neutral-900 mb-xs">
                    Date of Birth
                  </label>
                  <input
                    type="date"
                    value={dateOfBirth}
                    onChange={(e) => setDateOfBirth(e.target.value)}
                    className="w-full px-md py-sm border border-neutral-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-neutral-900"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-neutral-900 mb-xs">
                  Current Address
                </label>
                <input
                  type="text"
                  value={currentAddress}
                  onChange={(e) => setCurrentAddress(e.target.value)}
                  placeholder="Where do you live now?"
                  className="w-full px-md py-sm border border-neutral-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-neutral-900"
                />
              </div>
            </div>
          </div>

          {/* Work & Financial */}
          <div className="bg-white rounded-lg p-lg border border-neutral-200">
            <div className="flex items-center justify-between mb-lg">
              <h2 className="text-lg font-semibold text-neutral-900">Work & Finances</h2>
              {/* Student toggle */}
              <label className="flex items-center gap-sm cursor-pointer select-none">
                <span className="text-sm text-neutral-600">I&apos;m a student</span>
                <button
                  type="button"
                  role="switch"
                  aria-checked={isStudent}
                  onClick={() => setIsStudent(!isStudent)}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-neutral-900 ${isStudent ? 'bg-neutral-900' : 'bg-neutral-300'}`}
                >
                  <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${isStudent ? 'translate-x-6' : 'translate-x-1'}`} />
                </button>
              </label>
            </div>

            <div className="space-y-md">
              <div>
                <label className="block text-sm font-medium text-neutral-900 mb-xs">
                  Profession {!isStudent && <span className="text-red-500">*</span>}
                </label>
                <input
                  type="text"
                  value={profession}
                  onChange={(e) => setProfession(e.target.value)}
                  placeholder={isStudent ? 'e.g., Student, Part-time barista' : 'e.g., Software Engineer, Marketing Manager'}
                  className="w-full px-md py-sm border border-neutral-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-neutral-900"
                  required={!isStudent}
                />
              </div>

              {isStudent ? (
                <>
                  <div className="grid grid-cols-2 gap-md">
                    <div>
                      <label className="block text-sm font-medium text-neutral-900 mb-xs">University</label>
                      <input
                        type="text"
                        value={university}
                        onChange={(e) => setUniversity(e.target.value)}
                        placeholder="e.g., University of London"
                        className="w-full px-md py-sm border border-neutral-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-neutral-900"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-neutral-900 mb-xs">Year of Study</label>
                      <select
                        value={studyYear}
                        onChange={(e) => setStudyYear(e.target.value)}
                        className="w-full px-md py-sm border border-neutral-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-neutral-900"
                      >
                        <option value="">Select year</option>
                        {['1st year','2nd year','3rd year','4th year','Masters','PhD','Foundation'].map(y => (
                          <option key={y} value={y}>{y}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-neutral-900 mb-xs">Course / Subject</label>
                    <input
                      type="text"
                      value={courseStudied}
                      onChange={(e) => setCourseStudied(e.target.value)}
                      placeholder="e.g., Computer Science, Business Management"
                      className="w-full px-md py-sm border border-neutral-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-neutral-900"
                    />
                  </div>
                  <div className="rounded-xl bg-amber-50 border border-amber-200 p-md">
                    <p className="text-sm font-semibold text-amber-900 mb-xs">🎓 Student applications require a UK guarantor</p>
                    <p className="text-sm text-amber-800">
                      As a student, a UK-based guarantor earning at least{' '}
                      <strong>£{advertiserRent ? Math.round(advertiserRent * 36).toLocaleString() : '---'}/yr</strong>{' '}
                      will be required before we can proceed. This is typically a parent or guardian.
                    </p>
                    <label className="flex items-start gap-sm mt-md cursor-pointer">
                      <input
                        type="checkbox"
                        checked={guarantorConfirmed}
                        onChange={(e) => setGuarantorConfirmed(e.target.checked)}
                        className="mt-0.5 h-4 w-4 shrink-0 accent-amber-700"
                      />
                      <span className="text-sm text-amber-900">I have a UK guarantor who can meet this requirement</span>
                    </label>
                  </div>
                </>
              ) : (
                <div>
                  <label className="block text-sm font-medium text-neutral-900 mb-xs">
                    Salary (Annual)
                  </label>
                  <input
                    type="text"
                    value={salary}
                    onChange={(e) => setSalary(e.target.value)}
                    placeholder="e.g., £35,000 - £40,000"
                    className="w-full px-md py-sm border border-neutral-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-neutral-900"
                  />
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-neutral-900 mb-xs">
                  LinkedIn Profile (optional)
                </label>
                <input
                  type="url"
                  value={linkedinUrl}
                  onChange={(e) => setLinkedinUrl(e.target.value)}
                  placeholder="https://linkedin.com/in/yourprofile"
                  className="w-full px-md py-sm border border-neutral-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-neutral-900"
                />
              </div>
            </div>
          </div>

          {/* Tell Us About Yourself */}
          <div className="bg-white rounded-lg p-lg border border-neutral-200">
            <h2 className="text-lg font-semibold text-neutral-900 mb-lg">
              Tell Us About Yourself
            </h2>

            <div className="space-y-md">
              <div>
                <label className="block text-sm font-medium text-neutral-900 mb-xs">
                  Bio <span className="text-red-500">*</span>
                </label>
                <textarea
                  value={bio}
                  onChange={(e) => setBio(e.target.value)}
                  placeholder="Who are you? What do you do? (2-3 sentences)"
                  rows={4}
                  className="w-full px-md py-sm border border-neutral-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-neutral-900"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-neutral-900 mb-xs">
                  Tell us more about your career
                </label>
                <textarea
                  value={professionDescription}
                  onChange={(e) => setProfessionDescription(e.target.value)}
                  placeholder="What do you do day-to-day? What are you passionate about in your work?"
                  rows={3}
                  className="w-full px-md py-sm border border-neutral-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-neutral-900"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-neutral-900 mb-xs">
                  Interests & Hobbies
                </label>
                <input
                  type="text"
                  value={interests}
                  onChange={(e) => setInterests(e.target.value)}
                  placeholder="e.g., cooking, gaming, outdoor activities, reading"
                  className="w-full px-md py-sm border border-neutral-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-neutral-900"
                />
              </div>
            </div>
          </div>

          {/* What Are You Like to Live With */}
          <div className="bg-white rounded-lg p-lg border border-neutral-200">
            <h2 className="text-lg font-semibold text-neutral-900 mb-lg">
              What Are You Like to Live With?
            </h2>

            <div className="space-y-md">
              <div>
                <label className="block text-sm font-medium text-neutral-900 mb-xs">
                  How would you describe yourself?
                </label>
                <div className="grid grid-cols-3 gap-md">
                  {['sociable', 'flexible', 'keep-to-self'].map((option) => (
                    <label
                      key={option}
                      className={`flex items-center p-md border-2 rounded-lg cursor-pointer transition-all ${
                        sociability === option
                          ? 'border-neutral-900 bg-neutral-50'
                          : 'border-neutral-200 hover:border-neutral-300'
                      }`}
                    >
                      <input
                        type="radio"
                        name="sociability"
                        value={option}
                        checked={sociability === option}
                        onChange={(e) => setSociability(e.target.value)}
                        className="w-4 h-4"
                      />
                      <span className="ml-sm text-sm font-medium text-neutral-900 capitalize">
                        {option === 'keep-to-self'
                          ? 'Keep to Myself'
                          : option.charAt(0).toUpperCase() + option.slice(1)}
                      </span>
                    </label>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-neutral-900 mb-xs">
                  What's important to you in a shared house?
                </label>
                <textarea
                  value={housePreferences}
                  onChange={(e) => setHousePreferences(e.target.value)}
                  placeholder="e.g., quiet hours, cleanliness, cooking together, regular house meetings"
                  rows={3}
                  className="w-full px-md py-sm border border-neutral-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-neutral-900"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-neutral-900 mb-xs">
                  How do you prefer to communicate and resolve issues?
                </label>
                <textarea
                  value={communicationStyle}
                  onChange={(e) => setCommunicationStyle(e.target.value)}
                  placeholder="e.g., direct conversations, house meetings, group chat"
                  rows={3}
                  className="w-full px-md py-sm border border-neutral-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-neutral-900"
                />
              </div>
            </div>
          </div>

          {/* About This Room */}
          <div className="bg-white rounded-lg p-lg border border-neutral-200">
            <h2 className="text-lg font-semibold text-neutral-900 mb-lg">
              About This Room
            </h2>

            <div className="space-y-md">
              <div>
                <label className="block text-sm font-medium text-neutral-900 mb-xs">
                  What do you need in this room?
                </label>
                <textarea
                  value={roomRequirements}
                  onChange={(e) => setRoomRequirements(e.target.value)}
                  placeholder="e.g., natural light, quiet, space for WFH, double bed fit, storage"
                  rows={3}
                  className="w-full px-md py-sm border border-neutral-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-neutral-900"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-neutral-900 mb-xs">
                  Any specific conditions based on what you've seen?
                </label>
                <textarea
                  value={roomConditions}
                  onChange={(e) => setRoomConditions(e.target.value)}
                  placeholder="e.g., needs accommodation for two people, needs to fit my equipment, concerned about noise from street"
                  rows={3}
                  className="w-full px-md py-sm border border-neutral-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-neutral-900"
                />
              </div>
            </div>
          </div>

          {/* Rent */}
          <div className="bg-white rounded-lg p-lg border border-neutral-200">
            <h2 className="text-lg font-semibold text-neutral-900 mb-lg">
              About the Rent
            </h2>

            <div className="space-y-md">
              <div className="bg-neutral-50 p-md rounded-lg border border-neutral-200">
                <p className="text-sm text-neutral-600">
                  <span className="font-semibold text-neutral-900">
                    The advertised rent for this room is £{advertiserRent ? advertiserRent.toFixed(0) : '---'}/month
                  </span>
                  <br />
                  <span className="text-xs">(all bills included)</span>
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-neutral-900 mb-md">
                  Your offer:
                </label>
                <div className="space-y-sm">
                  <label className={`flex items-center p-md border-2 rounded-lg cursor-pointer transition-all ${
                    rentOfferType === 'asking'
                      ? 'border-neutral-900 bg-neutral-50'
                      : 'border-neutral-200 hover:border-neutral-300'
                  }`}>
                    <input
                      type="radio"
                      name="rentOfferType"
                      value="asking"
                      checked={rentOfferType === 'asking'}
                      onChange={(e) => setRentOfferType(e.target.value)}
                      className="w-4 h-4"
                    />
                    <span className="ml-sm text-sm font-medium text-neutral-900">
                      Yes, I'm offering the advertised rent (£{advertiserRent ? advertiserRent.toFixed(0) : '---'})
                    </span>
                  </label>

                  <label className={`flex items-center p-md border-2 rounded-lg cursor-pointer transition-all ${
                    rentOfferType === 'below_asking'
                      ? 'border-neutral-900 bg-neutral-50'
                      : 'border-neutral-200 hover:border-neutral-300'
                  }`}>
                    <input
                      type="radio"
                      name="rentOfferType"
                      value="below_asking"
                      checked={rentOfferType === 'below_asking'}
                      onChange={(e) => setRentOfferType(e.target.value)}
                      className="w-4 h-4"
                    />
                    <span className="ml-sm text-sm font-medium text-neutral-900">
                      I'd like to make an offer below asking price
                    </span>
                  </label>
                </div>
              </div>

              {/* Affordability calculator */}
              {(() => {
                const aff = getAffordability()
                if (aff.status === 'unknown') return null
                if (aff.status === 'student') return null
                return (
                  <div className={`rounded-xl p-md border text-sm ${
                    aff.status === 'pass'
                      ? 'bg-green-50 border-green-200 text-green-900'
                      : aff.status === 'borderline'
                      ? 'bg-amber-50 border-amber-200 text-amber-900'
                      : 'bg-red-50 border-red-200 text-red-900'
                  }`}>
                    <p className="font-semibold mb-xs">
                      {aff.status === 'pass' ? '✓ Referencing check' : aff.status === 'borderline' ? '⚠️ Referencing check' : '✗ Referencing check'}
                    </p>
                    <p className="leading-relaxed">{aff.message}</p>
                    {aff.status === 'fail' && 'options' in aff && (
                      <ul className="mt-sm space-y-xs">
                        {aff.options.map((opt: string) => (
                          <li key={opt} className="flex items-start gap-sm">
                            <span className="shrink-0">→</span>
                            <span>{opt}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                    {(aff.status === 'fail' || aff.status === 'borderline') && (
                      <p className="mt-sm text-xs opacity-80">
                        Salary threshold: 30× monthly rent. Guarantor threshold: 36× monthly rent. You can still submit your application — our team will be in touch about next steps.
                      </p>
                    )}
                  </div>
                )
              })()}

              {rentOfferType === 'below_asking' && (
                <div>
                  <label className="block text-sm font-medium text-neutral-900 mb-xs">
                    Your offer amount (£/month)
                  </label>
                  <input
                    type="number"
                    value={offeredRent || ''}
                    onChange={(e) => setOfferedRent(e.target.value ? parseFloat(e.target.value) : null)}
                    placeholder="e.g., 800"
                    className="w-full px-md py-sm border border-neutral-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-neutral-900"
                  />
                </div>
              )}
            </div>
          </div>

          {/* Rental Preferences */}
          <div className="bg-white rounded-lg p-lg border border-neutral-200">
            <h2 className="text-lg font-semibold text-neutral-900 mb-lg">
              Rental Preferences
            </h2>

            <div className="space-y-md">
              <div className="grid grid-cols-2 gap-md">
                <div>
                  <label className="block text-sm font-medium text-neutral-900 mb-xs">
                    Preferred Start Date
                  </label>
                  <input
                    type="date"
                    value={preferredStartDate}
                    onChange={(e) => setPreferredStartDate(e.target.value)}
                    className="w-full px-md py-sm border border-neutral-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-neutral-900"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-neutral-900 mb-xs">
                    Preferred Term
                  </label>
                  <select
                    value={preferredTerm}
                    onChange={(e) => setPreferredTerm(e.target.value)}
                    className="w-full px-md py-sm border border-neutral-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-neutral-900"
                  >
                    <option value="6 months">6 months</option>
                    <option value="12 months">12 months</option>
                    <option value="flexible">Flexible</option>
                  </select>
                </div>
              </div>
            </div>
          </div>

          {/* Rental History */}
          <div className="bg-white rounded-lg p-lg border border-neutral-200">
            <div className="flex items-center justify-between mb-lg">
              <h2 className="text-lg font-semibold text-neutral-900">
                Rental History
              </h2>
              <button
                type="button"
                onClick={addPreviousAddress}
                className="text-sm font-medium text-neutral-600 hover:text-neutral-900"
              >
                + Add address
              </button>
            </div>

            <div className="space-y-lg">
              {previousAddresses.map((addr, idx) => (
                <div
                  key={idx}
                  className="p-md border border-neutral-200 rounded-lg space-y-md"
                >
                  <div className="flex items-center justify-between mb-md">
                    <span className="text-sm font-medium text-neutral-600">
                      Address {idx + 1}
                    </span>
                    {previousAddresses.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removePreviousAddress(idx)}
                        className="text-xs text-red-600 hover:text-red-700 font-medium"
                      >
                        Remove
                      </button>
                    )}
                  </div>

                  <input
                    type="text"
                    placeholder="Address"
                    value={addr.address}
                    onChange={(e) =>
                      updatePreviousAddress(idx, 'address', e.target.value)
                    }
                    className="w-full px-md py-sm border border-neutral-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-neutral-900 text-sm"
                  />

                  <div className="grid grid-cols-2 gap-md">
                    <div>
                      <label className="block text-xs text-neutral-500 mb-xs">Moved in</label>
                      <input
                        type="text"
                        placeholder="e.g. Sept 2021"
                        value={addr.movedIn}
                        onChange={(e) =>
                          updatePreviousAddress(idx, 'movedIn', e.target.value)
                        }
                        className="w-full px-md py-sm border border-neutral-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-neutral-900 text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-neutral-500 mb-xs">Moved out</label>
                      <input
                        type="text"
                        placeholder="e.g. March 2023"
                        value={addr.movedOut}
                        onChange={(e) =>
                          updatePreviousAddress(idx, 'movedOut', e.target.value)
                        }
                        className="w-full px-md py-sm border border-neutral-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-neutral-900 text-sm"
                      />
                    </div>
                  </div>

                  <input
                    type="text"
                    placeholder="Why did you leave?"
                    value={addr.reasonLeft}
                    onChange={(e) =>
                      updatePreviousAddress(idx, 'reasonLeft', e.target.value)
                    }
                    className="w-full px-md py-sm border border-neutral-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-neutral-900 text-sm"
                  />
                </div>
              ))}
            </div>
          </div>

          {/* Privacy & Consent */}
          <div className="bg-neutral-50 rounded-lg p-lg border border-neutral-200">
            <label className="flex items-start gap-md cursor-pointer">
              <input
                type="checkbox"
                checked={privacyConsent}
                onChange={(e) => setPrivacyConsent(e.target.checked)}
                className="w-5 h-5 mt-xs rounded border-neutral-300 focus:ring-2 focus:ring-neutral-900"
                required
              />
              <div>
                <span className="text-sm font-medium text-neutral-900">
                  I accept the privacy policy
                </span>
                <p className="text-xs text-neutral-600 mt-xs">
                  I understand that Capital Rooms will hold my data until my
                  application is either accepted and progresses to tenancy, or
                  rejected/withdrawn and deleted within 30 days.{' '}
                  <a
                    href="/applicant/privacy"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-medium text-neutral-900 hover:underline"
                  >
                    Read full privacy policy →
                  </a>
                </p>
              </div>
            </label>
          </div>

          {/* Submit */}
          <div className="flex gap-md">
            <button
              type="submit"
              disabled={loading || !privacyConsent}
              className="flex-1 py-md px-lg rounded-lg bg-neutral-900 text-white font-semibold hover:bg-neutral-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {loading ? 'Submitting...' : 'Submit Application'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
