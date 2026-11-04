// Annual statement (income & expenditure) for one landlord and one UK tax year (6 April – 5 April) —
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
    ...(sumOf(pr, 'fee', 'management fee') ? [{ description: 'Less management fees', amount: -sumOf(pr, 'fee', 'management fee'), kind: 'less' as const }] : []),
    ...(sumOf(pr, 'fee', 'letting fee') ? [{ description: 'Less letting fees', amount: -sumOf(pr, 'fee', 'letting fee'), kind: 'less' as const }] : []),
    ...(sumOf(pr, 'expense') ? [{ description: 'Less property expenses', amount: -sumOf(pr, 'expense'), kind: 'less' as const }] : []),
  ])
  const cap = (c: string) => c.charAt(0).toUpperCase() + c.slice(1)
  const gbp = (n: number) => `£${n.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
  // the SA105 boxes, each with what's in it
  const boxRows = y.bySa105.flatMap(x => [
    [`Box ${x.box} · ${x.label}`, gbp(x.amount)] as [string, string],
    ...(x.categories.length > 1 || (x.box !== '20' && x.categories.length) ? x.categories.map(([c, v]) => [`    ${cap(c)}`, gbp(v)] as [string, string]) : []),
  ])
  return {
    count: books.rows.length,
    pdf: await renderInvoiceStyleDocument({
      pdfTitle: `Annual statement ${ty.label}`,
      docTitle: 'Annual statement',
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
        title: 'Your SA105 UK property pages',
        rows: [
          ...boxRows,
          ...(y.feesVat ? [['VAT included in box 27', gbp(y.feesVat)] as [string, string]] : []),
          ['Landlord payments made to you in the year', gbp(y.paidToLandlord)],
        ],
        note: `Figures are on the cash basis: rent and fees in the month the rent is for, payments to you on the day they were made. The boxes are those accountants normally use for each type of cost — please confirm with your accountant. Box 36 is for replacing furniture, furnishings, appliances and kitchenware only, not furnishing a property for the first time. ${books.vat ? `Our fees include VAT at ${books.vat.rate}% from ${new Date(books.vat.from + 'T12:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}.` : 'Capital Rooms is not VAT registered.'}`,
      },
      continuedRef: ty.label,
      biz: await fetchPDFBizSettings(),
    }),
  }
}
