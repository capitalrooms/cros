// PDF document component for Capital Rooms Rental Valuation Letters
// Rendered server-side via @react-pdf/renderer — never runs in the browser
// Letterhead assets extracted directly from the Capital Rooms brand DOCX; never use text substitutes

import {
  Document,
  Page,
  View,
  Text,
  Image,
  StyleSheet,
  Font,
} from '@react-pdf/renderer'
import { LOGO_B64, FOOTER_STRIP_B64, WORDMARK_B64 } from './letterhead'

// ─── Types ───────────────────────────────────────────────────────────────────

export type PriceRow = {
  label: string   // e.g. "Room 1 – Double ensuite"
  low: number
  average: number
  top: number
  notes?: string
}

export type RefurbItem = {
  category: string   // e.g. "Kitchen"
  description: string
  estimatedCost: number
}

export type ValuationType =
  | 'current_market'
  | 'post_refurb'
  | 'single_let'
  | 'investment_analysis'

export type ValuationData = {
  type: ValuationType
  // Recipient
  recipientName: string
  recipientAddress: string[]   // each line
  // Property
  propertyAddress: string
  propertyRef?: string
  // Letter body
  openingParagraph: string
  closingParagraph: string
  // Pricing
  rooms: PriceRow[]
  currency?: string   // default '£'
  // Refurbishment (post_refurb only)
  refurbTier?: 'light' | 'full' | 'extensive'
  refurbItems?: RefurbItem[]
  refurbNotes?: string
  // Single let (single_let only)
  singleLetLow?: number
  singleLetAverage?: number
  singleLetTop?: number
  // Investment analysis (investment_analysis only)
  grossYieldHmo?: number
  grossYieldSingleLet?: number
  investmentNotes?: string
  // Footer
  preparedBy?: string
  // Date override (defaults to today)
  letterDate?: string
  // Disclaimer override
  disclaimer?: string
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  page: {
    fontFamily: 'Helvetica',
    fontSize: 9,
    color: '#1a1a1a',
    paddingTop: 20,
    paddingBottom: 60,
    paddingHorizontal: 42,
  },
  // Header
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
    paddingBottom: 10,
    marginBottom: 18,
  },
  logoBlock: { width: 120 },
  logo: { width: 60, height: 60, objectFit: 'contain' },
  wordmark: { width: 140, height: 48, objectFit: 'contain', marginTop: 4 },
  contactBlock: {
    alignItems: 'flex-end',
    fontSize: 7.5,
    color: '#555',
    lineHeight: 1.5,
  },
  contactBold: { fontFamily: 'Helvetica-Bold', color: '#1a1a1a' },
  // Date + Recipient
  meta: { marginBottom: 16 },
  dateLine: { fontSize: 8.5, color: '#555', marginBottom: 10 },
  recipientName: { fontFamily: 'Helvetica-Bold', fontSize: 9, marginBottom: 1 },
  recipientLine: { fontSize: 8.5, color: '#333' },
  // Subject line
  subjectRow: { marginBottom: 14 },
  subjectLabel: { fontFamily: 'Helvetica-Bold', fontSize: 9 },
  subjectText: { fontSize: 9 },
  // Body text
  para: { lineHeight: 1.6, marginBottom: 10 },
  // Section heading
  sectionHeading: {
    fontFamily: 'Helvetica-Bold',
    fontSize: 9.5,
    color: '#1a1a1a',
    borderBottomWidth: 0.5,
    borderBottomColor: '#ccc',
    paddingBottom: 3,
    marginBottom: 8,
    marginTop: 14,
  },
  // Table
  table: { marginBottom: 12 },
  tableHeader: {
    flexDirection: 'row',
    backgroundColor: '#1a1a1a',
    color: '#fff',
    fontFamily: 'Helvetica-Bold',
    fontSize: 8,
    paddingVertical: 4,
    paddingHorizontal: 6,
    borderRadius: 2,
    marginBottom: 1,
  },
  tableRow: {
    flexDirection: 'row',
    borderBottomWidth: 0.5,
    borderBottomColor: '#eee',
    paddingVertical: 4,
    paddingHorizontal: 6,
  },
  tableRowAlt: {
    backgroundColor: '#f8f8f8',
  },
  colRoom: { flex: 3 },
  colPrice: { flex: 1.2, textAlign: 'right' },
  colPriceHeader: { flex: 1.2, textAlign: 'right', color: '#fff' },
  cellText: { fontSize: 8 },
  cellNote: { fontSize: 7, color: '#888', marginTop: 1 },
  // Refurb table
  refurbRow: {
    flexDirection: 'row',
    borderBottomWidth: 0.5,
    borderBottomColor: '#eee',
    paddingVertical: 4,
    paddingHorizontal: 6,
  },
  colRefurbCat: { flex: 1.5 },
  colRefurbDesc: { flex: 3 },
  colRefurbCost: { flex: 1, textAlign: 'right' },
  totalRow: {
    flexDirection: 'row',
    paddingVertical: 5,
    paddingHorizontal: 6,
    backgroundColor: '#f0f0f0',
    borderRadius: 2,
    marginTop: 2,
  },
  totalLabel: { flex: 4.5, fontFamily: 'Helvetica-Bold', fontSize: 8 },
  totalValue: { flex: 1, textAlign: 'right', fontFamily: 'Helvetica-Bold', fontSize: 8 },
  // Single let / investment boxes
  highlightBox: {
    backgroundColor: '#f8f8f8',
    borderWidth: 0.5,
    borderColor: '#ddd',
    borderRadius: 3,
    padding: 10,
    marginBottom: 10,
  },
  highlightRow: { flexDirection: 'row', marginBottom: 4 },
  highlightLabel: { flex: 2, fontSize: 8, color: '#555' },
  highlightValue: { flex: 1, fontSize: 8, fontFamily: 'Helvetica-Bold', textAlign: 'right' },
  // Disclaimer
  disclaimer: {
    fontSize: 7,
    color: '#888',
    lineHeight: 1.4,
    borderTopWidth: 0.5,
    borderTopColor: '#ddd',
    paddingTop: 6,
    marginTop: 16,
  },
  // Footer
  footer: {
    position: 'absolute',
    bottom: 16,
    left: 42,
    right: 42,
  },
  footerStrip: { width: '100%', height: 28, objectFit: 'contain', objectPositionX: 'left' },
})

// ─── Helpers ─────────────────────────────────────────────────────────────────

function currency(val: number, sym = '£') {
  return `${sym}${val.toLocaleString('en-GB')}`
}

function currencyPcm(val: number, sym = '£') {
  return `${currency(val, sym)} pcm`
}

function formatDate(iso?: string) {
  const d = iso ? new Date(iso) : new Date()
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
}

function typeName(t: ValuationType) {
  return {
    current_market: 'Current Market Rental Valuation',
    post_refurb: 'Post-Refurbishment Rental Valuation',
    single_let: 'Single Let Rental Valuation',
    investment_analysis: 'HMO vs Single Let Investment Analysis',
  }[t]
}

function refurbTierLabel(t?: string) {
  return { light: 'Light Refurbishment', full: 'Full Refurbishment', extensive: 'Extensive Refurbishment' }[t ?? ''] ?? ''
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function PageHeader() {
  return (
    <View style={s.header}>
      <View style={s.logoBlock}>
        <Image src={LOGO_B64} style={s.logo} />
        <Image src={WORDMARK_B64} style={s.wordmark} />
      </View>
      <View style={s.contactBlock}>
        <Text style={s.contactBold}>Capital Rooms</Text>
        <Text>info@capitalrooms.co.uk</Text>
        <Text>www.capitalrooms.co.uk</Text>
      </View>
    </View>
  )
}

function RoomPricingTable({ rooms, sym }: { rooms: PriceRow[]; sym: string }) {
  return (
    <View style={s.table}>
      <View style={s.tableHeader}>
        <Text style={s.colRoom}>Room</Text>
        <Text style={s.colPriceHeader}>Low</Text>
        <Text style={s.colPriceHeader}>Average</Text>
        <Text style={s.colPriceHeader}>Top</Text>
      </View>
      {rooms.map((r, i) => (
        <View key={i} style={[s.tableRow, i % 2 === 1 ? s.tableRowAlt : {}]}>
          <View style={s.colRoom}>
            <Text style={s.cellText}>{r.label}</Text>
            {r.notes ? <Text style={s.cellNote}>{r.notes}</Text> : null}
          </View>
          <Text style={[s.colPrice, s.cellText]}>{currencyPcm(r.low, sym)}</Text>
          <Text style={[s.colPrice, s.cellText]}>{currencyPcm(r.average, sym)}</Text>
          <Text style={[s.colPrice, s.cellText]}>{currencyPcm(r.top, sym)}</Text>
        </View>
      ))}
      {/* Totals row */}
      <View style={s.totalRow}>
        <Text style={s.totalLabel}>Combined monthly income (average scenario)</Text>
        <Text style={s.totalValue}>{currencyPcm(rooms.reduce((a, r) => a + r.average, 0), sym)}</Text>
      </View>
    </View>
  )
}

function RefurbTable({ items, sym }: { items: RefurbItem[]; sym: string }) {
  const total = items.reduce((a, i) => a + i.estimatedCost, 0)
  return (
    <View style={s.table}>
      <View style={s.tableHeader}>
        <Text style={s.colRefurbCat}>Category</Text>
        <Text style={s.colRefurbDesc}>Works</Text>
        <Text style={[s.colRefurbCost, { color: '#fff' }]}>Est. Cost</Text>
      </View>
      {items.map((item, i) => (
        <View key={i} style={[s.refurbRow, i % 2 === 1 ? s.tableRowAlt : {}]}>
          <Text style={[s.colRefurbCat, s.cellText]}>{item.category}</Text>
          <Text style={[s.colRefurbDesc, s.cellText]}>{item.description}</Text>
          <Text style={[s.colRefurbCost, s.cellText]}>{currency(item.estimatedCost, sym)}</Text>
        </View>
      ))}
      <View style={s.totalRow}>
        <Text style={s.totalLabel}>Total estimated refurbishment cost</Text>
        <Text style={s.totalValue}>{currency(total, sym)}</Text>
      </View>
    </View>
  )
}

// ─── Main document ────────────────────────────────────────────────────────────

export function ValuationDocument({ data }: { data: ValuationData }) {
  const sym = data.currency ?? '£'
  const disclaimer =
    data.disclaimer ??
    'This valuation has been prepared by Capital Rooms based on current market conditions and comparable rental evidence at the time of writing. Figures stated are estimates and subject to change. This document does not constitute a formal valuation report or legal advice. Capital Rooms accepts no liability for decisions made solely on the basis of this document.'

  return (
    <Document
      title={`Capital Rooms – ${typeName(data.type)} – ${data.propertyAddress}`}
      author="Capital Rooms"
    >
      <Page size="A4" style={s.page}>
        <PageHeader />

        {/* Date + Recipient */}
        <View style={s.meta}>
          <Text style={s.dateLine}>{formatDate(data.letterDate)}</Text>
          <Text style={s.recipientName}>{data.recipientName}</Text>
          {data.recipientAddress.map((line, i) => (
            <Text key={i} style={s.recipientLine}>{line}</Text>
          ))}
        </View>

        {/* Subject */}
        <View style={s.subjectRow}>
          <Text>
            <Text style={s.subjectLabel}>Re: </Text>
            <Text style={s.subjectText}>
              {typeName(data.type)} — {data.propertyAddress}
              {data.propertyRef ? ` (Ref: ${data.propertyRef})` : ''}
            </Text>
          </Text>
        </View>

        {/* Opening paragraph */}
        <Text style={s.para}>{data.openingParagraph}</Text>

        {/* ── Current Market / Post-Refurb / Single Let: room table ── */}
        {(data.type === 'current_market' || data.type === 'post_refurb') && data.rooms.length > 0 && (
          <>
            <Text style={s.sectionHeading}>
              {data.type === 'post_refurb' && data.refurbTier
                ? `Room-by-Room Rental Valuation – ${refurbTierLabel(data.refurbTier)}`
                : 'Room-by-Room Rental Valuation'}
            </Text>
            <RoomPricingTable rooms={data.rooms} sym={sym} />
          </>
        )}

        {/* ── Post-refurb: refurbishment cost breakdown ── */}
        {data.type === 'post_refurb' && data.refurbItems && data.refurbItems.length > 0 && (
          <>
            <Text style={s.sectionHeading}>Indicative Refurbishment Cost Breakdown</Text>
            <RefurbTable items={data.refurbItems} sym={sym} />
            {data.refurbNotes && <Text style={s.para}>{data.refurbNotes}</Text>}
          </>
        )}

        {/* ── Single let pricing ── */}
        {data.type === 'single_let' && (
          <>
            <Text style={s.sectionHeading}>Single Let Rental Estimate</Text>
            <View style={s.highlightBox}>
              {[
                ['Conservative (Low)', data.singleLetLow],
                ['Market Average', data.singleLetAverage],
                ['Premium (Top)', data.singleLetTop],
              ].map(([label, val]) =>
                val != null ? (
                  <View key={label as string} style={s.highlightRow}>
                    <Text style={s.highlightLabel}>{label as string}</Text>
                    <Text style={s.highlightValue}>{currencyPcm(val as number, sym)}</Text>
                  </View>
                ) : null
              )}
            </View>
          </>
        )}

        {/* ── Investment analysis ── */}
        {data.type === 'investment_analysis' && (
          <>
            <Text style={s.sectionHeading}>HMO Rental Income – Room by Room</Text>
            {data.rooms.length > 0 && <RoomPricingTable rooms={data.rooms} sym={sym} />}

            <Text style={s.sectionHeading}>Yield Comparison</Text>
            <View style={s.highlightBox}>
              {data.grossYieldHmo != null && (
                <View style={s.highlightRow}>
                  <Text style={s.highlightLabel}>Gross yield – HMO (average scenario)</Text>
                  <Text style={s.highlightValue}>{data.grossYieldHmo.toFixed(1)}%</Text>
                </View>
              )}
              {data.singleLetAverage != null && (
                <View style={s.highlightRow}>
                  <Text style={s.highlightLabel}>Single let estimate (market average)</Text>
                  <Text style={s.highlightValue}>{currencyPcm(data.singleLetAverage, sym)}</Text>
                </View>
              )}
              {data.grossYieldSingleLet != null && (
                <View style={s.highlightRow}>
                  <Text style={s.highlightLabel}>Gross yield – single let</Text>
                  <Text style={s.highlightValue}>{data.grossYieldSingleLet.toFixed(1)}%</Text>
                </View>
              )}
            </View>
            {data.investmentNotes && <Text style={s.para}>{data.investmentNotes}</Text>}
          </>
        )}

        {/* Closing paragraph */}
        <Text style={s.para}>{data.closingParagraph}</Text>

        {/* Prepared by */}
        {data.preparedBy && (
          <Text style={[s.para, { marginTop: 6 }]}>Yours sincerely,{'\n\n'}{data.preparedBy}{'\n'}Capital Rooms</Text>
        )}

        {/* Disclaimer */}
        <Text style={s.disclaimer}>{disclaimer}</Text>

        {/* Footer strip */}
        <View style={s.footer} fixed>
          <Image src={FOOTER_STRIP_B64} style={s.footerStrip} />
        </View>
      </Page>
    </Document>
  )
}
