// The one palette for Capital Rooms paperwork (4 Nov 2026, Harry: "too many colours … i like two or three"): Forest for
// headings, figures and emphasis; brand gold only for small labels and a rule; ink, grey, hairlines and a pale tint for
// everything else. `alert` is for a real problem only (overdue rent, high AML risk, practice-mode warnings) — never for
// an ordinary deduction such as a fee. Contractors' own invoices (lib/supplierInvoices) keep their own colour.
export const PDF: Record<'forest' | 'gold' | 'ink' | 'muted' | 'line' | 'tint' | 'white' | 'alert', string> = {
  forest: '#1F3B2E',
  gold: '#B8862A',
  ink: '#132219',
  muted: '#5C6B62',
  line: '#DCE2DC',
  tint: '#F3F5F2',
  white: '#FFFFFF',
  alert: '#9B2C1F',
}
