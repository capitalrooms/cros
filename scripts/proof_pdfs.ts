// Proof test: generates valuation + rent-increase cover letter PDFs
// using TEST-0000 in the phone field to confirm live DB settings flow through.
// Run from cros/ with: npx tsx scripts/proof_pdfs.ts

// Load env vars explicitly (dotenvx encrypted .env.local needs the dotenvx runner;
// we load the raw .env.local values here via dotenv as a fallback for tsx context)
import { config } from 'dotenv'
config({ path: '.env.local', override: false })

import { generateValuationPDF } from '@/lib/valuations/generatePDF'
import { generateCoverLetter } from '@/lib/rent-increase/generatePDF'
import { fetchPDFBizSettings } from '@/lib/pdfLetterhead'
import { writeFileSync } from 'fs'
import path from 'path'

const OUT = path.resolve(__dirname, '../..')
// Write to Downloads so it's easy to open
const DOWNLOADS = process.env.HOME + '/Downloads'

async function main() {
  const biz = await fetchPDFBizSettings()
  console.log('\n── Business settings fetched from DB ──────────────────────────')
  console.log(`  company_name:  ${biz.company_name}`)
  console.log(`  address_line1: ${biz.address_line1}`)
  console.log(`  city:          ${biz.city}`)
  console.log(`  postcode:      ${biz.postcode}`)
  console.log(`  email:         ${biz.email}`)
  console.log(`  phone:         ${biz.phone}`)
  console.log('────────────────────────────────────────────────────────────────\n')

  if (biz.phone !== 'TEST-0000') {
    console.warn('⚠️  WARNING: phone is not TEST-0000 — DB may not have been updated yet')
  }

  // ── 1. Valuation PDF ───────────────────────────────────────────────────────
  const valBuf = await generateValuationPDF({
    type: 'hmo_current',
    recipientName: 'Test Recipient',
    recipientAddress: ['123 Test Street', 'London', 'E1 1AA'],
    propertyAddress: '208 Rotherhithe Street, London, SE16 7RB',
    openingParagraph: 'Thank you for asking us to prepare this rental valuation.',
    closingParagraph: 'We look forward to working with you.',
    rooms: [
      { label: 'Room 1 – Double', low: 950, high: 1050 },
      { label: 'Room 2 – Single', low: 800, high: 875 },
    ],
    preparedBy: 'Harry Buchanan',
    senderJobTitle: 'Director',
    senderDirectPhone: '07700 900 123',
    letterDate: new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }),
    bizSettings: biz,
  })
  const valPath = `${DOWNLOADS}/PROOF_valuation_${Date.now()}.pdf`
  writeFileSync(valPath, valBuf)
  console.log(`✅ Valuation PDF:         ${valPath} (${valBuf.length} bytes)`)

  // ── 2. Rent-increase cover letter ──────────────────────────────────────────
  const riCoverBuf = await generateCoverLetter({
    tenantTitle:      'Miss',
    tenantFullName:   'Rebecca Rumsey',
    tenantFirstName:  'Rebecca',
    roomName:         'Room 2',
    propertyAddress:  '208 Rotherhithe Street, London, SE16 7RB',
    propertyPostcode: 'SE16 7RB',
    landlordName:     'Test Landlord Ltd',
    tenancyStartDate: '2023-03-15',
    currentRent:      900,
    proposedRent:     975,
    effectiveDate:    '2026-11-15',
    noticeServedDate: '2026-09-08',
    lastS13Date:      null,
    marketAreaDescription: 'SE16',
    senderName:        'Harry Buchanan',
    senderJobTitle:    'Director',
    senderDirectPhone: '07700 900 123',
    bizSettings:       biz,
  })
  const riPath = `${DOWNLOADS}/PROOF_rent_increase_cover_${Date.now()}.pdf`
  writeFileSync(riPath, riCoverBuf)
  console.log(`✅ Rent-increase cover:   ${riPath} (${riCoverBuf.length} bytes)`)

  console.log('\nOpen both files to verify footer shows TEST-0000 in the phone field.\n')
}

main().catch(e => { console.error(e); process.exit(1) })
