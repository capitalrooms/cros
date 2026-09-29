// What the landlord AML form must collect, per section. Used by the form (to show what is still
// needed) and by the server (to refuse an incomplete submission). Based on MLR 2017 regs 27–28
// (identify and verify customer and beneficial owners), 33/35 (EDD, PEPs) and HMRC AMLG guidance
// for letting agency businesses.

export type SectionKey = 'type' | 'identity' | 'ownership' | 'aml' | 'bank' | 'compliance' | 'declaration'

type F = Record<string, unknown> & { documents?: Record<string, string[]> }

const has = (f: F, k: string) => typeof f[k] === 'string' ? (f[k] as string).trim() !== '' : !!f[k]
const doc = (f: F, type: string) => (f.documents?.[type]?.length ?? 0) > 0

export const isJoint = (f: F) => f.entity_type === 'individual' && f.joint === 'yes'

export function missingFor(section: SectionKey, f: F): string[] {
  const m: string[] = []
  const need = (ok: boolean, label: string) => { if (!ok) m.push(label) }
  const company = f.entity_type === 'company'

  switch (section) {
    case 'type':
      need(has(f, 'entity_type'), 'Individual or company')
      need(has(f, 'property_count'), 'Number of properties')
      if (f.entity_type === 'individual') need(f.joint === 'yes' || f.joint === 'no', 'Whether there is a second (joint) landlord')
      break

    case 'identity':
      if (company) {
        need(has(f, 'company_name'), 'Company name')
        need(has(f, 'company_reg'), 'Company registration number')
        need(has(f, 'registered_office'), 'Registered office address')
        need(has(f, 'directors'), 'Directors and beneficial owners (25%+)')
        need(has(f, 'contact_phone'), 'Contact phone')
        need(has(f, 'contact_email'), 'Contact email')
        need(doc(f, 'certificate_of_incorporation'), 'Upload: Certificate of Incorporation')
        need(doc(f, 'director_id'), 'Upload: ID for each director / beneficial owner')
        need(doc(f, 'director_address'), 'Upload: proof of address for each director / beneficial owner')
      } else {
        const who = isJoint(f) ? 'First landlord' : 'Your'
        need(has(f, 'first_name') && has(f, 'last_name'), `${who} full name`)
        need(has(f, 'dob'), `${who} date of birth`)
        need(has(f, 'nationality'), `${who} nationality`)
        need(has(f, 'addr_line1') && has(f, 'addr_town') && has(f, 'addr_postcode'), `${who} residential address`)
        need(has(f, 'contact_phone'), `${who} contact phone`)
        need(has(f, 'contact_email'), `${who} contact email`)
        need(doc(f, 'id_document'), `Upload: ${isJoint(f) ? 'first landlord’s' : 'your'} photo ID`)
        need(doc(f, 'proof_of_address'), `Upload: ${isJoint(f) ? 'first landlord’s' : 'your'} proof of address`)
        if (isJoint(f)) {
          need(has(f, 'j_first_name') && has(f, 'j_last_name'), 'Second landlord full name')
          need(has(f, 'j_dob'), 'Second landlord date of birth')
          need(has(f, 'j_nationality'), 'Second landlord nationality')
          need(f.j_same_address === true || (has(f, 'j_addr_line1') && has(f, 'j_addr_town') && has(f, 'j_addr_postcode')), 'Second landlord residential address')
          need(has(f, 'j_contact_email') || has(f, 'j_contact_phone'), 'Second landlord email or phone')
          need(doc(f, 'joint_id_document'), 'Upload: second landlord’s photo ID')
          need(doc(f, 'joint_proof_of_address'), 'Upload: second landlord’s proof of address')
        }
      }
      break

    case 'ownership': {
      if (f.property_count === 'multiple') {
        const first = (f.properties as Array<Record<string, string>> | undefined)?.[0]
        need(!!(first?.line1 && first?.town), 'At least one property address')
      } else {
        need(has(f, 'prop_line1') && has(f, 'prop_town') && has(f, 'prop_postcode'), 'Property address')
      }
      need(doc(f, 'proof_of_ownership'), 'Upload: proof of ownership')
      break
    }

    case 'aml':
      need(f.pep === 'yes' || f.pep === 'no', isJoint(f) ? 'First landlord: politically exposed person question' : 'Politically exposed person question')
      if (f.pep === 'yes') need(has(f, 'pep_details'), 'Details of the public position held')
      if (isJoint(f)) {
        need(f.j_pep === 'yes' || f.j_pep === 'no', 'Second landlord: politically exposed person question')
        if (f.j_pep === 'yes') need(has(f, 'j_pep_details'), 'Second landlord: details of the public position held')
      }
      need(f.acting_for_other === 'yes' || f.acting_for_other === 'no', 'Whether you act on behalf of anyone else')
      if (f.acting_for_other === 'yes') need(has(f, 'acting_for_details'), 'Who you act on behalf of')
      need(has(f, 'source_of_funds'), 'How the property was funded')
      need(has(f, 'source_of_funds_details'), 'A short explanation of the source of funds')
      need(has(f, 'country_of_residence'), 'Country of residence')
      break

    case 'bank':
      need(has(f, 'account_holder'), 'Account holder name')
      need(has(f, 'bank_name'), 'Bank name')
      need(has(f, 'sort_code'), 'Sort code')
      need(has(f, 'account_number'), 'Account number')
      need(f.uk_resident === 'yes' || f.uk_resident === 'no', 'UK tax residency')
      break

    case 'compliance':
      break

    case 'declaration':
      need(f.declaration === true, 'Tick the declaration')
      break
  }
  return m
}

export const REQUIRED_SECTIONS: SectionKey[] = ['type', 'identity', 'ownership', 'aml', 'bank', 'declaration']

export function missingAll(f: F): { section: SectionKey; items: string[] }[] {
  return REQUIRED_SECTIONS.map(section => ({ section, items: missingFor(section, f) })).filter(x => x.items.length)
}
