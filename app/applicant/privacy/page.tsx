export default function PrivacyPolicy() {
  return (
    <div className="min-h-screen bg-neutral-100 py-xl px-lg">
      <div className="mx-auto max-w-2xl">
        <div className="bg-white rounded-lg p-lg border border-neutral-200">
          <h1 className="text-3xl font-bold text-neutral-900 mb-sm">
            Privacy Policy
          </h1>
          <p className="text-sm text-neutral-600 mb-lg">
            Applicant Data & GDPR Compliance
          </p>

          <div className="space-y-lg text-sm text-neutral-700">
            {/* Introduction */}
            <section>
              <h2 className="text-lg font-semibold text-neutral-900 mb-md">
                1. Introduction
              </h2>
              <p>
                Capital Rooms Ltd ("we", "us", "our") respects your privacy. This
                policy explains how we collect, use, and protect your personal data
                when you submit an application to rent a room through our platform.
              </p>
            </section>

            {/* Data Collection */}
            <section>
              <h2 className="text-lg font-semibold text-neutral-900 mb-md">
                2. What Data Do We Collect?
              </h2>
              <p className="mb-md">
                When you complete an application form, we collect:
              </p>
              <ul className="list-disc list-inside space-y-sm mb-md text-neutral-600">
                <li>Full name, email address, phone number</li>
                <li>Date of birth</li>
                <li>Current address</li>
                <li>Employment details (profession, salary)</li>
                <li>LinkedIn profile URL (optional)</li>
                <li>Personal information (bio, interests, housemate preferences)</li>
                <li>Rental history (previous addresses, move dates, reasons for leaving)</li>
                <li>Room-specific requirements and conditions</li>
                <li>Rent offer (if different from advertised price)</li>
              </ul>
              <p className="text-neutral-600">
                We collect this data because you provide it voluntarily when
                completing the application form.
              </p>
            </section>

            {/* Why We Use It */}
            <section>
              <h2 className="text-lg font-semibold text-neutral-900 mb-md">
                3. Why Do We Use Your Data?
              </h2>
              <p>We use your data to:</p>
              <ul className="list-disc list-inside space-y-sm text-neutral-600 mt-md">
                <li>
                  Assess your suitability for the room and compatibility with the
                  property
                </li>
                <li>
                  Conduct referencing checks with our referencing provider (Homeppl)
                </li>
                <li>
                  Verify your rental history and background information
                </li>
                <li>
                  Communicate with you about your application status
                </li>
                <li>
                  Process your rental agreement if your application is accepted
                </li>
                <li>
                  Comply with legal obligations (e.g., right-to-rent checks)
                </li>
              </ul>
            </section>

            {/* Who We Share With */}
            <section>
              <h2 className="text-lg font-semibold text-neutral-900 mb-md">
                4. Who Do We Share Your Data With?
              </h2>
              <p>Your data may be shared with:</p>
              <ul className="list-disc list-inside space-y-sm text-neutral-600 mt-md">
                <li>
                  <strong>Homeppl</strong> - Our referencing provider, who will
                  conduct credit and rental history checks
                </li>
                <li>
                  <strong>The Property Landlord/Owner</strong> - To assess your
                  application for the specific room
                </li>
                <li>
                  <strong>Our Team</strong> - Staff who need to process your
                  application
                </li>
                <li>
                  <strong>Legal/Compliance Services</strong> - Only if required by
                  law
                </li>
              </ul>
              <p className="text-neutral-600 mt-md">
                We do not sell your data to third parties or use it for marketing
                without your consent.
              </p>
            </section>

            {/* Data Retention */}
            <section>
              <h2 className="text-lg font-semibold text-neutral-900 mb-md">
                5. How Long Do We Keep Your Data?
              </h2>
              <div className="bg-neutral-50 border-l-4 border-neutral-900 p-md mb-md">
                <p className="font-semibold text-neutral-900 mb-sm">
                  Our Data Retention Policy:
                </p>
                <ul className="list-disc list-inside space-y-sm text-neutral-600">
                  <li>
                    <strong>If Your Application Is Rejected:</strong> We delete your
                    data within 30 days of the decision
                  </li>
                  <li>
                    <strong>If You Withdraw:</strong> We delete your data within 30
                    days of withdrawal
                  </li>
                  <li>
                    <strong>If Your Application Is Accepted:</strong> Your data is
                    retained as part of your tenancy records for the duration of
                    your tenancy, plus 6 years after tenancy ends (for legal and
                    accounting purposes)
                  </li>
                </ul>
              </div>
              <p className="text-neutral-600">
                You can request deletion at any time by emailing{" "}
                <a
                  href="mailto:management@capitalrooms.co.uk"
                  className="font-medium text-neutral-900 hover:underline"
                >
                  management@capitalrooms.co.uk
                </a>
                .
              </p>
            </section>

            {/* Your Rights */}
            <section>
              <h2 className="text-lg font-semibold text-neutral-900 mb-md">
                6. Your Rights Under GDPR
              </h2>
              <p>You have the right to:</p>
              <ul className="list-disc list-inside space-y-sm text-neutral-600 mt-md">
                <li>
                  <strong>Access</strong> - Request a copy of all data we hold
                  about you
                </li>
                <li>
                  <strong>Rectification</strong> - Correct any inaccurate data
                </li>
                <li>
                  <strong>Deletion</strong> - Request deletion of your data (the
                  "right to be forgotten")
                </li>
                <li>
                  <strong>Restrict Processing</strong> - Limit how we use your data
                </li>
                <li>
                  <strong>Data Portability</strong> - Receive your data in a
                  portable format
                </li>
                <li>
                  <strong>Object</strong> - Object to specific uses of your data
                </li>
              </ul>
              <p className="text-neutral-600 mt-md">
                To exercise any of these rights, email{" "}
                <a
                  href="mailto:management@capitalrooms.co.uk"
                  className="font-medium text-neutral-900 hover:underline"
                >
                  management@capitalrooms.co.uk
                </a>{" "}
                with "Data Subject Request" in the subject line.
              </p>
            </section>

            {/* Security */}
            <section>
              <h2 className="text-lg font-semibold text-neutral-900 mb-md">
                7. Data Security
              </h2>
              <p>
                We take security seriously. Your data is protected by:
              </p>
              <ul className="list-disc list-inside space-y-sm text-neutral-600 mt-md">
                <li>Encrypted transmission (HTTPS)</li>
                <li>Secure database storage</li>
                <li>Limited access (admin staff only)</li>
                <li>Regular security reviews</li>
              </ul>
              <p className="text-neutral-600 mt-md">
                While we take all reasonable precautions, no online transmission is
                100% secure.
              </p>
            </section>

            {/* Contact */}
            <section>
              <h2 className="text-lg font-semibold text-neutral-900 mb-md">
                8. Contact & Data Protection
              </h2>
              <p>
                If you have questions about this privacy policy or your data,
                contact:
              </p>
              <div className="bg-neutral-50 p-md rounded-lg mt-md text-neutral-900">
                <p className="font-medium mb-sm">Capital Rooms Ltd</p>
                <p>Third Floor | 86-90 Paul Street | London | EC2A 4NE</p>
                <p className="mt-sm">
                  📧{" "}
                  <a
                    href="mailto:management@capitalrooms.co.uk"
                    className="font-medium hover:underline"
                  >
                    management@capitalrooms.co.uk
                  </a>
                </p>
                <p>
                  📞{" "}
                  <a href="tel:02071129163" className="font-medium hover:underline">
                    0207 112 9163
                  </a>
                </p>
              </div>
            </section>

            {/* Legal Basis */}
            <section>
              <h2 className="text-lg font-semibold text-neutral-900 mb-md">
                9. Legal Basis for Processing
              </h2>
              <p>
                We process your data under the following legal bases:
              </p>
              <ul className="list-disc list-inside space-y-sm text-neutral-600 mt-md">
                <li>
                  <strong>Your Consent:</strong> You agree to this policy when you
                  submit the application form
                </li>
                <li>
                  <strong>Contractual Necessity:</strong> To assess and enter into a
                  rental agreement with you
                </li>
                <li>
                  <strong>Legal Obligation:</strong> To comply with right-to-rent
                  and other legal requirements
                </li>
              </ul>
            </section>

            {/* Updates */}
            <section>
              <h2 className="text-lg font-semibold text-neutral-900 mb-md">
                10. Policy Updates
              </h2>
              <p>
                We may update this policy from time to time. We will notify you of
                any significant changes by email or through the application portal.
                Your continued use of our services constitutes acceptance of any
                changes.
              </p>
              <p className="text-neutral-600 mt-md">
                <strong>Last Updated:</strong> August 2026
              </p>
            </section>
          </div>
        </div>

        {/* Back Link */}
        <div className="mt-lg">
          <a
            href="/applicant/apply"
            className="text-sm font-medium text-neutral-600 hover:text-neutral-900 transition-colors"
          >
            ← Back to Application
          </a>
        </div>
      </div>
    </div>
  )
}
