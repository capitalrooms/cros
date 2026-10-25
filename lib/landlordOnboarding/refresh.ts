// Updating an existing landlord's AML details (22 Oct 2026, Harry: "if they have already uploaded some documents 12
// months ago … passport and ID they do not need to do this again they can click to say X document received on x date
// (use ai scanning) … say whether it is up to date or not"). The re-verification form opens with what they told us
// last time; documents that stay valid (photo ID in date, proof of ownership) are carried over with what the AI read
// from them; proof of address always has to be new (it must be dated within three months).
const ADDRESS_TYPES = new Set(['proof_of_address', 'joint_proof_of_address', 'director_address'])
const LABELS: Record<string, string> = {
  id_document: 'Photo ID', joint_id_document: 'Second landlord’s photo ID', director_id: 'Director’s photo ID',
  proof_of_address: 'Proof of address', joint_proof_of_address: 'Second landlord’s proof of address', director_address: 'Director’s proof of address',
  proof_of_ownership: 'Proof of ownership', company_documents: 'Company documents', property_document: 'Property documents',
}
const label = (t: string) => LABELS[t] ?? t.replace(/_/g, ' ').replace(/^./, c => c.toUpperCase())

export interface PreviousDoc { type: string; label: string; files: number; read: string | null; status: 'confirm' | 'new_needed'; why: string }
export interface PreviousDetails { onboardingId: string; sentOn: string | null; documents: PreviousDoc[] }

/** What to carry into a re-verification form from the landlord's last one, and the summary shown to them. */
export function carryOver(prev: { id: string; docs_received_at?: string | null; created_at?: string | null; form_data?: Record<string, any> | null }) {
  const f = prev.form_data ?? {}
  const answers: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(f)) if (!k.startsWith('__') && k !== 'documents' && k !== 'property_docs') answers[k] = v
  const checks: { label: string; detail: string }[] = f.__review?.checks ?? []
  const documents: Record<string, string[]> = {}
  const summary: PreviousDoc[] = []
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/London' })
  for (const [type, paths] of Object.entries((f.documents ?? {}) as Record<string, string[]>)) {
    if (!paths?.length) continue
    const who = type.startsWith('joint_') ? 'Second landlord' : type.startsWith('director_') ? 'Directors' : null
    const mine = (c: { label: string }) => who ? c.label.startsWith(who) : /^(Landlord|First landlord):/.test(c.label)
    if (ADDRESS_TYPES.has(type)) {
      summary.push({ type, label: label(type), files: paths.length, read: checks.find(c => mine(c) && /proof of address type/.test(c.label))?.detail ?? null, status: 'new_needed', why: 'Proof of address must be dated within the last three months, so please upload a new one.' })
      continue
    }
    if (/id_document|director_id/.test(type)) {
      const kind = checks.find(c => mine(c) && /photo ID type/.test(c.label))?.detail ?? null
      const expiry = checks.find(c => mine(c) && /ID in date/.test(c.label))?.detail.match(/(\d{4}-\d{2}-\d{2})/)?.[1] ?? null
      const expired = !!expiry && expiry < today
      const read = [kind, expiry ? `expires ${new Date(`${expiry}T12:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })}` : null].filter(Boolean).join(' · ') || null
      if (expired) { summary.push({ type, label: label(type), files: paths.length, read, status: 'new_needed', why: 'This ID has expired — please upload your current one.' }); continue }
      documents[type] = paths
      summary.push({ type, label: label(type), files: paths.length, read, status: 'confirm', why: 'Still in date — nothing to do unless it has changed (a new passport, a name change).' })
      continue
    }
    documents[type] = paths
    summary.push({ type, label: label(type), files: paths.length, read: null, status: 'confirm', why: 'We still hold this — nothing to do unless it has changed (for example, you have sold or bought a property).' })
  }
  const previous: PreviousDetails = { onboardingId: prev.id, sentOn: prev.docs_received_at ?? prev.created_at ?? null, documents: summary }
  return { formData: { ...answers, documents, property_docs: f.property_docs ?? [], __previous: previous }, previous }
}
