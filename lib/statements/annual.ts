// Annual income & expenditure summary for one landlord and one UK tax year (6 April – 5 April) —
// what they need for their self-assessment: rent received, our fees, expenses, and what was paid to them.
// Built from the books (lib/finance/books) — the same figures as the Books screen — in the house money-document layout.
import type { SupabaseClient } from '@supabase/supabase-js'
import { renderInvoiceStyleDocument, type DocLine } from '@/lib/invoices/invoiceDocument'
import { fetchPDFBizSettings } from '@/lib/pdfLetterhead'
import { landlordFormalNames } from '@/lib/people'
import { loadBooks, landlordYear } from '@/lib/finance/books'

const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100
export const taxYear = (startYear: number) => ({ from: `${startYear}-04-06`, to: `${startYear + 1}-04-05`, label: `${startYear}/${String(startYear + 1).slice(2)}` })

export async function renderAnnualSummary(s: SupabaseClient, landlordId: string, startYear: number) {
  const ty = taxYear(startYear)
  // the books (lib/finance/books): the same figures as the Books screen and the accountant's CSV — rent and fees by the
  // month the rent is for, letting fees included (4 Nov 2026: this summary used to leave them out), costs by category
  const [{ data: landlord }, books] = await Promise.all([
    s.from('people').select('*').eq('id', landlordId).maybeSingle(),
    loadBooks(s, { from: ty.from, to: ty.to, landlordId }),
  ])
  if (!landlord) throw new Error('Landlord not found')
  const y = landlordYear(books)
  const props = [...new Set(books.rows.filter(r => r.kind !== 'deposit').map(r => r.property))].sort((a, b) => String(a).localeCompare(String(b), undefined, { numeric: true }))
  const sumOf = (pr: string, kind: string, cat?: string) => r2(books.rows.filter(r => r.property === pr && r.kind === kind && (!cat || r.category === cat)).reduce((t, r) => t + r.amount, 0))
  const lines: DocLine[] = props.flatMap(pr => [
    { description: pr, detail: 'Rent received', amount: sumOf(pr, 'rent') },
    ...(sumOf(pr, 'fee', 'management fee') ? [{ description: 'Less our management fees', amount: -sumOf(pr, 'fee', 'management fee'), kind: 'less' as const }] : []),
    ...(sumOf(pr, 'fee', 'letting fee') ? [{ description: 'Less our letting fees', amount: -sumOf(pr, 'fee', 'letting fee'), kind: 'less' as const }] : []),
    ...(sumOf(pr, 'expense') ? [{ description: 'Less property expenses', amount: -sumOf(pr, 'expense'), kind: 'less' as const }] : []),
  ])
  const expenseRows = y.expensesByCategory.map(([c, v]) => [c.charAt(0).toUpperCase() + c.slice(1), `£${v.toFixed(2)}`] as [string, string])
  return {
    count: books.rows.length,
    pdf: await renderInvoiceStyleDocument({
      pdfTitle: `Annual summary ${ty.label}`,
      docTitle: 'Annual summary',
      subtitle: `Tax year 6 April ${startYear} to 5 April ${startYear + 1}`,
      recipientName: landlordFormalNames(landlord as any) || 'Landlord',
      addressLines: String((landlord as any).home_address || '').split(/\n|,\s*/).map((l: string) => l.trim()).filter(Boolean),
      propertyLine: 'Income and expenditure for your tax return',
      meta: [['Tax year', ty.label], ['Properties', String(props.length)], ['Date', new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })]],
      columns: 'amount',
      lines: props.length ? [...lines,
        { description: 'Total rent received', amount: y.rent, kind: 'subtotal' as const },
        { description: 'Less management fees', amount: -y.managementFees, kind: 'less' as const },
        { description: 'Less letting fees', amount: -y.lettingFees, kind: 'less' as const },
        { description: 'Less property expenses', amount: -y.expenses, kind: 'less' as const },
      ] : [{ description: 'Nothing recorded in this tax year', amount: 0 }],
      totalLabel: 'Net rental income',
      total: y.profit,
      pay: {
        title: 'For your records',
        rows: [
          ['Rent received', `£${y.rent.toFixed(2)}`], ['Management fees', `£${y.managementFees.toFixed(2)}`], ['Letting fees', `£${y.lettingFees.toFixed(2)}`],
          ...(y.feesVat ? [['of which VAT on our fees', `£${y.feesVat.toFixed(2)}`] as [string, string]] : []),
          ['Property expenses', `£${y.expenses.toFixed(2)}`], ...expenseRows.map(([k, v]) => [`  ${k}`, v] as [string, string]),
          ['Paid to you in the year', `£${y.paidToLandlord.toFixed(2)}`],
        ],
        note: `Rent and fees are counted in the month the rent is for; payments to you on the day they were made. Our fees and the property expenses are normally allowable against rental income — please confirm with your accountant. ${books.vat ? `Our fees include VAT at ${books.vat.rate}% from ${new Date(books.vat.from + 'T12:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}.` : 'Capital Rooms is not VAT registered.'}`,
      },
      continuedRef: ty.label,
      biz: await fetchPDFBizSettings(),
    }),
  }
}
