// Fill an applicant's details from text pasted from an email or a landlord's form (17 Oct 2026) — the
// "Tenants Full Name: … / Contact Number: … / Date of Birth: 25/09/2001 / Move in date: 18.10.2026" sheet landlords
// like Nigel ask for. One "Label: value" per line; labels are matched loosely, anything unrecognised is ignored.
export interface SheetFields {
  full_name?: string; email?: string; phone?: string; date_of_birth?: string; current_address?: string
  profession?: string; company?: string; study?: string; salary?: string; preferred_start_date?: string
  preferred_term?: string; linkedin_url?: string; room_requirements?: string
}

const LABELS: [RegExp, keyof SheetFields][] = [
  [/full\s*name|^name$|tenant'?s?\s*name/i, 'full_name'],
  [/e-?mail/i, 'email'],
  [/contact\s*(number|no)|mobile|phone|tel/i, 'phone'],
  [/date\s*of\s*birth|d\.?o\.?b|birthday/i, 'date_of_birth'],
  [/current\s*address|address/i, 'current_address'],
  [/uni|course|stud(y|ying)/i, 'study'],
  [/profession|occupation|job|employ|company|work/i, 'profession'],
  [/salary|income|earn/i, 'salary'],
  [/move\s*-?\s*in|start\s*date|moving/i, 'preferred_start_date'],
  [/contract\s*length|term|length\s*of\s*stay|how\s*long/i, 'preferred_term'],
  [/linked\s*in/i, 'linkedin_url'],
  [/requirement|furniture|needs/i, 'room_requirements'],
]
const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec']

/** "25/09/2001", "18.10.2026", "1 November 2026", "2026-11-01" → "YYYY-MM-DD" (UK day-first); null when unclear */
export function ukDate(v: string): string | null {
  const s = v.trim()
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/)
  if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`
  m = s.match(/^(\d{1,2})[./\-\s](\d{1,2})[./\-\s](\d{2,4})\b/)
  if (m) { const y = m[3].length === 2 ? `20${m[3]}` : m[3]; if (+m[2] >= 1 && +m[2] <= 12 && +m[1] >= 1 && +m[1] <= 31) return `${y}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}` }
  m = s.match(/^(\d{1,2})(?:st|nd|rd|th)?\s+([a-z]+)\s+(\d{4})/i)
  if (m) { const mo = MONTHS.indexOf(m[2].slice(0, 3).toLowerCase()); if (mo >= 0) return `${m[3]}-${String(mo + 1).padStart(2, '0')}-${m[1].padStart(2, '0')}` }
  return null
}

export function parseApplicantSheet(text: string): SheetFields {
  const out: SheetFields = {}
  for (const raw of text.replace(/\r/g, '').split('\n')) {
    const line = raw.trim()
    const i = line.indexOf(':')
    if (i < 1) continue
    const label = line.slice(0, i).trim(), value = line.slice(i + 1).trim()
    if (!value || /^(n\/?a|none|-+)$/i.test(value)) continue
    const key = LABELS.find(([re]) => re.test(label))?.[1]
    if (!key || out[key]) continue
    if (key === 'date_of_birth' || key === 'preferred_start_date') { const d = ukDate(value); if (d) out[key] = d; continue }
    if (key === 'profession' && /company/i.test(label) && / at /i.test(value)) { const [p, c] = value.split(/ at /i); out.profession = p.trim(); out.company = c.trim(); continue }
    out[key] = value.slice(0, 400)
  }
  return out
}
