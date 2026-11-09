// The old site's /page/… addresses: the guarantor calculator and communication preferences.
import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { PageTop } from '../../parts'
import { GuarantorCalc } from '../../Calculators'
import Enquiry from '../../Enquiry'

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params
  if (slug === '9-guarantor-affordability-calculator') return { title: 'Guarantor Affordability Calculator (UK)', description: 'Work out the minimum income a guarantor needs for a rental in the UK: most letting agents ask for 36 times the monthly rent.', alternates: { canonical: `/page/${slug}` } }
  return { title: 'Communication preferences', robots: { index: false }, alternates: { canonical: `/page/${slug}` } }
}

export default async function OldPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  if (slug === '9-guarantor-affordability-calculator') return (
    <>
      <PageTop eyebrow="Calculator" title="Guarantor affordability" lead="In the UK, most letting agents require a guarantor to earn at least 3× the annual rent (equivalent to 36× the monthly rent). This works out the minimum guarantor income needed." />
      <section className="block" style={{ paddingTop: 48 }}><div className="wrap"><GuarantorCalc /></div></section>
    </>
  )
  if (slug === '6-update-your-communication-preference') return (
    <>
      <PageTop eyebrow="Your details" title="Update your communication preference" lead="Tell us how you’d like us to get in touch." />
      <section className="block" style={{ paddingTop: 48 }}><div className="wrap"><div className="card" style={{ maxWidth: 860 }}>
        <Enquiry kind="preferences" submit="Update my preference" fields={[
          { name: 'name', label: 'Name', required: true }, { name: 'telephone', label: 'Telephone', type: 'tel', required: true },
          { name: 'email', label: 'Email', type: 'email', required: true }, { name: 'mobile', label: 'Mobile', type: 'tel' },
          { name: 'address', label: 'Address', required: true, full: true },
          { name: 'contact_by', label: 'How would you like to be contacted?', type: 'select', options: ['Telephone', 'Mobile', 'Email', 'Post'] },
        ]} />
      </div></div></section>
    </>
  )
  notFound()
}
