// Annual income & expenditure summary for one landlord and one UK tax year (6 April – 5 April) —
// what they need for their self-assessment: rent received, our fees, expenses, and what was paid to them.
// Built from the landlord's statements in the year, in the house money-document layout.
import type { SupabaseClient } from '@supabase/supabase-js'
import { renderInvoiceStyleDocument, type DocLine } from '@/lib/invoices/invoiceDocument'
import { fetchPDFBizSettings } from '@/lib/pdfLetterhead'
import { landlordFormalNames } from '@/lib/people'

const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100
export const taxYear = (startYear: number) => ({ from: `${startYear}-04-06`, to: `${startYear + 1}-04-05`, label: `${startYear}/${String(startYear + 1).slice(2)}` })

export async function renderAnnualSummary(s: SupabaseClient, landlordId: string, startYear: number) {
  const ty = taxYear(startYear)
  const [{ data: landlord }, { data: sts }] = await Promise.all([
    s.from('people').select('*').eq('id', landlordId).maybeSingle(),
    s.from('landlord_statements').select('statement_reference, statement_date, gross_rent, management_fees, property_charges, net_to_landlord, paid_date, properties(name)')
      .eq('landlord_id', landlordId).gte('statement_date', ty.from).lte('statement_date', ty.to).order('statement_date'),
  ])
  if (!landlord) throw new Error('Landlord not found')
  const rows = (sts ?? []) as any[]
  const tot = rows.reduce((t, x) => ({
    rent: r2(t.rent + Number(x.gross_rent || 0)), fees: r2(t.fees + Number(x.management_fees || 0)),
    exp: r2(t.exp + Number(x.property_charges || 0)), net: r2(t.net + Number(x.net_to_landlord || 0)),
  }), { rent: 0, fees: 0, exp: 0, net: 0 })
  const lines: DocLine[] = [
    ...rows.map(x => ({
      description: `${x.statement_reference} · ${String(x.properties?.name || '').split('\n')[0]}`,
      detail: `Rent £${Number(x.gross_rent || 0).toFixed(2)} · fee £${Number(x.management_fees || 0).toFixed(2)} · expenses £${Number(x.property_charges || 0).toFixed(2)}${x.paid_date ? ` · paid ${new Date(x.paid_date + 'T12:00:00').toLocaleDateString('en-GB')}` : ''}`,
      amount: Number(x.net_to_landlord || 0),
    })),
    { description: 'Total rent received', amount: tot.rent, kind: 'subtotal' as const },
    { description: 'Less management fees', amount: -tot.fees, kind: 'less' as const },
    { description: 'Less property expenses', amount: -tot.exp, kind: 'less' as const },
  ]
  return {
    count: rows.length,
    pdf: await renderInvoiceStyleDocument({
      pdfTitle: `Annual summary ${ty.label}`,
      docTitle: 'Annual summary',
      subtitle: `Tax year 6 April ${startYear} to 5 April ${startYear + 1}`,
      recipientName: landlordFormalNames(landlord as any) || 'Landlord',
      addressLines: String((landlord as any).home_address || '').split(/\n|,\s*/).map((l: string) => l.trim()).filter(Boolean),
      propertyLine: 'Income and expenditure for your tax return',
      meta: [['Tax year', ty.label], ['Statements', String(rows.length)], ['Date', new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })]],
      columns: 'amount',
      lines: rows.length ? lines : [{ description: 'No statements in this tax year', amount: 0 }],
      totalLabel: 'Paid to you',
      total: tot.net,
      pay: {
        title: 'For your records',
        rows: [['Rent received', `£${tot.rent.toFixed(2)}`], ['Our fees', `£${tot.fees.toFixed(2)}`], ['Expenses', `£${tot.exp.toFixed(2)}`]],
        note: 'Figures are taken from the monthly statements issued in the tax year. Our fees and the property expenses are normally allowable against rental income — please confirm with your accountant. Capital Rooms is not VAT registered.',
      },
      continuedRef: ty.label,
      biz: await fetchPDFBizSettings(),
    }),
  }
}
