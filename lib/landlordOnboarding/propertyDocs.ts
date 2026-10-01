// Property documents a landlord adds during onboarding: one drop zone per property, every file read by AI,
// which names it and pulls out the few facts we'd otherwise ask them to type (expiry dates, supplier, account
// numbers…). Shared by the form, the scan route, the review screen and the landlord record — no server imports.

export interface PropertyDoc {
  path: string                    // landlord-docs storage path
  property: number                // index into the landlord's properties (0 for a single property)
  type: string                    // a PROPERTY_DOC_TYPES key, 'other', or '' while unread
  label: string                   // what the AI called it, e.g. "Gas Safety Certificate (CP12)"
  info: Record<string, string>    // key facts read from the document
  expiry?: string                 // ISO date, when the document has one
  scanned: boolean                // the AI has read it (successfully or not)
  user_type?: boolean             // the landlord corrected the type themselves
  removed?: boolean               // the landlord removed it (kept for the audit trail)
  uploaded_at: string
}

export const PROPERTY_DOC_GROUPS = ['Certificates & safety', 'Property & legal', 'Tenancies', 'Bills & accounts', 'Other'] as const
type Group = typeof PROPERTY_DOC_GROUPS[number]

export const PROPERTY_DOC_TYPES: { key: string; label: string; group: Group; expected?: boolean }[] = [
  { key: 'gas_safety_certificate', label: 'Gas Safety Certificate (CP12)', group: 'Certificates & safety', expected: true },
  { key: 'eicr', label: 'Electrical report (EICR)', group: 'Certificates & safety', expected: true },
  { key: 'epc', label: 'Energy Performance Certificate (EPC)', group: 'Certificates & safety', expected: true },
  { key: 'fire_risk_assessment', label: 'Fire Risk Assessment', group: 'Certificates & safety', expected: true },
  { key: 'fire_detection_certificate', label: 'Fire alarm / detection certificate', group: 'Certificates & safety' },
  { key: 'emergency_lighting_certificate', label: 'Emergency lighting certificate', group: 'Certificates & safety' },
  { key: 'pat_test_record', label: 'PAT test record', group: 'Certificates & safety' },
  { key: 'legionella_risk_assessment', label: 'Legionella risk assessment', group: 'Certificates & safety' },
  { key: 'hmo_licence', label: 'HMO / property licence', group: 'Certificates & safety', expected: true },
  { key: 'asbestos_survey', label: 'Asbestos survey', group: 'Certificates & safety' },
  { key: 'floor_plan', label: 'Floor plan', group: 'Property & legal', expected: true },
  { key: 'title_register', label: 'Land Registry title', group: 'Property & legal' },
  { key: 'lease', label: 'Lease (leasehold)', group: 'Property & legal' },
  { key: 'service_charge', label: 'Service charge / ground rent demand', group: 'Property & legal' },
  { key: 'buildings_insurance', label: 'Buildings / landlord insurance', group: 'Property & legal', expected: true },
  { key: 'mortgage_statement', label: 'Mortgage statement or consent to let', group: 'Property & legal' },
  { key: 'planning_building_control', label: 'Planning / building control document', group: 'Property & legal' },
  { key: 'tenancy_agreement', label: 'Tenancy agreement', group: 'Tenancies', expected: true },
  { key: 'inventory', label: 'Inventory / check-in report', group: 'Tenancies' },
  { key: 'deposit_certificate', label: 'Deposit protection certificate', group: 'Tenancies' },
  { key: 'council_tax_bill', label: 'Council tax bill', group: 'Bills & accounts' },
  { key: 'utility_gas', label: 'Gas bill', group: 'Bills & accounts' },
  { key: 'utility_electricity', label: 'Electricity bill', group: 'Bills & accounts' },
  { key: 'utility_dual_fuel', label: 'Gas & electricity bill', group: 'Bills & accounts' },
  { key: 'water_bill', label: 'Water bill', group: 'Bills & accounts' },
  { key: 'broadband_bill', label: 'Broadband / phone bill', group: 'Bills & accounts' },
  { key: 'tv_licence', label: 'TV licence', group: 'Bills & accounts' },
  { key: 'other', label: 'Other document', group: 'Other' },
]

export const propertyDocLabel = (type: string) => PROPERTY_DOC_TYPES.find(t => t.key === type)?.label ?? (type ? type.replace(/_/g, ' ') : 'Reading…')
export const isPropertyDocType = (type: string) => PROPERTY_DOC_TYPES.some(t => t.key === type)

/** Facts worth showing, in a sensible order, with readable names. */
export const FACT_LABELS: Record<string, string> = {
  property_address: 'Address', expiry_date: 'Expires', issue_date: 'Issued', rating: 'Rating',
  certificate_number: 'Certificate no.', licence_number: 'Licence no.', supplier: 'Supplier', account_number: 'Account no.',
  meter_number: 'Meter no.', mpan: 'MPAN', mprn: 'MPRN', amount: 'Amount', period: 'Period', policy_number: 'Policy no.',
  insurer: 'Insurer', tenant_names: 'Tenants', rent: 'Rent', start_date: 'Start', end_date: 'End', lease_end: 'Lease ends',
  title_number: 'Title no.', council: 'Council', council_tax_band: 'Band', engineer: 'Engineer / company', notes: 'Notes',
}

export function docsForProperty(docs: PropertyDoc[] | undefined, property: number): PropertyDoc[] {
  return (docs ?? []).filter(d => d.property === property && !d.removed)
}

/**
 * Combine the server's copy with the form's copy, by file path. The scan route writes what the AI read on the
 * server; the form may still hold an older copy, so the AI's reading wins unless the landlord changed the type.
 */
export function mergePropertyDocs(server: unknown, client: unknown): PropertyDoc[] {
  const list = (v: unknown) => (Array.isArray(v) ? v : []).filter((d): d is PropertyDoc => !!d && typeof d === 'object' && typeof (d as PropertyDoc).path === 'string')
  const out = new Map<string, PropertyDoc>()
  for (const d of list(server)) out.set(d.path, d)
  for (const c of list(client)) {
    const s = out.get(c.path)
    if (!s) { out.set(c.path, c); continue }
    const read = s.scanned && !c.scanned ? { type: s.type, label: s.label, info: s.info, expiry: s.expiry, scanned: true } : {}
    const merged: PropertyDoc = { ...s, ...c, ...read, info: { ...(s.info ?? {}), ...(c.scanned ? c.info ?? {} : {}) } }
    if (c.user_type) { merged.type = c.type; merged.user_type = true }
    if (s.removed || c.removed) merged.removed = true
    out.set(c.path, merged)
  }
  return Array.from(out.values())
}

/** Names for the identity/ownership uploads (form_data.documents keys) on office screens. */
export const ONBOARDING_DOC_LABELS: Record<string, string> = {
  id_document: 'Photo ID — first landlord', proof_of_address: 'Proof of address — first landlord',
  joint_id_document: 'Photo ID — second landlord', joint_proof_of_address: 'Proof of address — second landlord',
  proof_of_ownership: 'Proof of ownership', certificate_of_incorporation: 'Certificate of Incorporation',
  articles_of_association: 'Articles of Association', director_id: 'Director ID', director_address: 'Director proof of address',
  gas_safety_certificate: 'Gas Safety Certificate', eicr: 'EICR', epc: 'EPC', fire_risk_assessment: 'Fire Risk Assessment',
  fire_detection_certificate: 'Fire alarm certificate', emergency_lighting_certificate: 'Emergency lighting certificate',
  pat_test_record: 'PAT test record', legionella_risk_assessment: 'Legionella risk assessment', hmo_licence: 'HMO licence',
  other_document: 'Other document',
}

/** Every file from an onboarding form, named, in a stable order (property documents last, by property). */
export function onboardingFiles(formData: unknown): { path: string; name: string; group: string }[] {
  const f = (formData && typeof formData === 'object' ? formData : {}) as Record<string, unknown>
  const documents = (f.documents ?? {}) as Record<string, string[]>
  const otherNames = (Array.isArray(f.other_doc_names) ? f.other_doc_names : []) as string[]
  const out: { path: string; name: string; group: string }[] = []
  for (const [type, paths] of Object.entries(documents)) {
    if (type === 'property_document' || !Array.isArray(paths)) continue
    paths.forEach((path, i) => out.push({
      path, group: 'Identity & ownership',
      name: type === 'other_document' && otherNames[i] ? otherNames[i] : `${ONBOARDING_DOC_LABELS[type] ?? type.replace(/_/g, ' ')}${paths.length > 1 ? ` (${i + 1})` : ''}`,
    }))
  }
  const props = f.property_count === 'multiple' && Array.isArray(f.properties)
    ? (f.properties as { line1?: string }[]).map((p, i) => p.line1 || `Property ${i + 1}`)
    : [String(f.prop_line1 || 'Property')]
  for (const d of (Array.isArray(f.property_docs) ? f.property_docs : []) as PropertyDoc[]) {
    if (d.removed) continue
    out.push({ path: d.path, group: props[d.property] ?? `Property ${d.property + 1}`, name: d.label || propertyDocLabel(d.type) })
  }
  return out
}
