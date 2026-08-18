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
            Help us understand if this is a great fit. This should take about
            2-3 minutes.
          </p>
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
            <h2 className="text-lg font-semibold text-neutral-900 mb-lg">
              Work & Finances
            </h2>

            <div className="space-y-md">
              <div>
                <label className="block text-sm font-medium text-neutral-900 mb-xs">
                  Profession <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={profession}
                  onChange={(e) => setProfession(e.target.value)}
                  placeholder="e.g., Software Engineer, Marketing Manager"
                  className="w-full px-md py-sm border border-neutral-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-neutral-900"
                  required
                />
              </div>

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
                    <input
                      type="date"
                      placeholder="Moved in"
                      value={addr.movedIn}
                      onChange={(e) =>
                        updatePreviousAddress(idx, 'movedIn', e.target.value)
                      }
                      className="px-md py-sm border border-neutral-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-neutral-900 text-sm"
                    />
                    <input
                      type="date"
                      placeholder="Moved out"
                      value={addr.movedOut}
                      onChange={(e) =>
                        updatePreviousAddress(idx, 'movedOut', e.target.value)
                      }
                      className="px-md py-sm border border-neutral-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-neutral-900 text-sm"
                    />
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
