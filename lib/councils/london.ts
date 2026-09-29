// Where to send (and what to tell tenants about) a property licence application, per London council.
// Keys are the council names postcodes.io returns as `admin_district`, so a postcode finds its council.
// `checked` = the licensing team's details were confirmed on the council's own site on that date; the rest are the
// council's main office and switchboard and should be checked before they go in a letter (the screen says so).
export interface Council {
  name: string            // formal name, as it appears in a letter
  address: string[]       // postal address lines, postcode last
  phone: string
  email?: string
  website?: string
  checked?: string        // YYYY-MM-DD
}

export const LONDON_COUNCILS: Record<string, Council> = {
  // confirmed 29 Sep 2026 (licensing team contact pages)
  Newham: { name: 'London Borough of Newham', address: ['Newham Dockside', '1000 Dockside Road', 'London', 'E16 2QU'], phone: '020 8430 2000', email: 'propertylicensing@newham.gov.uk', website: 'newham.gov.uk', checked: '2026-09-29' },
  Lewisham: { name: 'London Borough of Lewisham', address: ['Private Sector Housing Agency', '4th Floor, Laurence House', '1 Catford Road', 'London', 'SE6 4RU'], phone: '020 8314 6420', email: 'pshe@lewisham.gov.uk', website: 'lewisham.gov.uk', checked: '2026-09-29' },
  'Tower Hamlets': { name: 'London Borough of Tower Hamlets', address: ['Property Licensing, Health and Housing', 'Tower Hamlets Town Hall', '160 Whitechapel Road', 'London', 'E1 1BJ'], phone: '020 7364 5008', email: 'housinglicensing@towerhamlets.gov.uk', website: 'towerhamlets.gov.uk', checked: '2026-09-29' },
  'Waltham Forest': { name: 'London Borough of Waltham Forest', address: ['Private Sector Housing and Licensing Team', 'The Annexe, Town Hall', 'Fellowship Square, Forest Road', 'London', 'E17 4JF'], phone: '020 8496 3000', email: 'propertylicensing@walthamforest.gov.uk', website: 'walthamforest.gov.uk', checked: '2026-09-29' },
  Croydon: { name: 'London Borough of Croydon', address: ['Private Sector Housing Team', '3rd Floor Zone B, Bernard Weatherill House', '8 Mint Walk', 'Croydon', 'CR0 1EA'], phone: '020 8604 7474', email: 'hmo@croydon.gov.uk', website: 'croydon.gov.uk', checked: '2026-09-29' },
  Westminster: { name: 'Westminster City Council', address: ['Residential Environmental Health Team', 'City Hall', '64 Victoria Street', 'London', 'SW1E 6QP'], phone: '020 7641 6161', email: 'HMO@westminster.gov.uk', website: 'westminster.gov.uk', checked: '2026-09-29' },
  Southwark: { name: 'London Borough of Southwark', address: ['Private Rented Property Licensing', '160 Tooley Street', 'London', 'SE1 2QH'], phone: '020 7525 5000', website: 'southwark.gov.uk', checked: '2026-09-29' },

  // main office and switchboard — check before sending
  Barnet: { name: 'London Borough of Barnet', address: ['2 Bristol Avenue', 'Colindale', 'London', 'NW9 4EW'], phone: '020 8359 2000', website: 'barnet.gov.uk' },
  'Barking and Dagenham': { name: 'London Borough of Barking and Dagenham', address: ['Barking Town Hall', '1 Town Square', 'Barking', 'IG11 7LU'], phone: '020 8215 3000', website: 'lbbd.gov.uk' },
  Bexley: { name: 'London Borough of Bexley', address: ['Civic Offices', '2 Watling Street', 'Bexleyheath', 'DA6 7AT'], phone: '020 8303 7777', website: 'bexley.gov.uk' },
  Brent: { name: 'London Borough of Brent', address: ['Brent Civic Centre', '32 Engineers Way', 'Wembley', 'HA9 0FJ'], phone: '020 8937 1234', website: 'brent.gov.uk' },
  Bromley: { name: 'London Borough of Bromley', address: ['Civic Centre', '2 Westmoreland Road', 'Bromley', 'BR1 1AS'], phone: '020 8464 3333', website: 'bromley.gov.uk' },
  Camden: { name: 'London Borough of Camden', address: ['5 Pancras Square', 'London', 'N1C 4AG'], phone: '020 7974 4444', website: 'camden.gov.uk' },
  'City of London': { name: 'City of London Corporation', address: ['Guildhall', 'PO Box 270', 'London', 'EC2P 2EJ'], phone: '020 7606 3030', website: 'cityoflondon.gov.uk' },
  Ealing: { name: 'London Borough of Ealing', address: ['Perceval House', '14–16 Uxbridge Road', 'London', 'W5 2HL'], phone: '020 8825 5000', website: 'ealing.gov.uk' },
  Enfield: { name: 'London Borough of Enfield', address: ['Civic Centre', 'Silver Street', 'Enfield', 'EN1 3XA'], phone: '020 8379 1000', website: 'enfield.gov.uk' },
  Greenwich: { name: 'Royal Borough of Greenwich', address: ['The Woolwich Centre', '35 Wellington Street', 'London', 'SE18 6HQ'], phone: '020 8854 8888', website: 'royalgreenwich.gov.uk' },
  Hackney: { name: 'London Borough of Hackney', address: ['Hackney Service Centre', '1 Hillman Street', 'London', 'E8 1DY'], phone: '020 8356 3000', website: 'hackney.gov.uk' },
  'Hammersmith and Fulham': { name: 'London Borough of Hammersmith & Fulham', address: ['Hammersmith Town Hall', 'King Street', 'London', 'W6 9JU'], phone: '020 8748 3020', website: 'lbhf.gov.uk' },
  Haringey: { name: 'London Borough of Haringey', address: ['George Meehan House', '294 High Road', 'London', 'N22 8JZ'], phone: '020 8489 0000', website: 'haringey.gov.uk' },
  Havering: { name: 'London Borough of Havering', address: ['Town Hall', 'Main Road', 'Romford', 'RM1 3BD'], phone: '01708 434343', website: 'havering.gov.uk' },
  Hillingdon: { name: 'London Borough of Hillingdon', address: ['Civic Centre', 'High Street', 'Uxbridge', 'UB8 1UW'], phone: '01895 250111', website: 'hillingdon.gov.uk' },
  Hounslow: { name: 'London Borough of Hounslow', address: ['Hounslow House', '7 Bath Road', 'Hounslow', 'TW3 3EB'], phone: '020 8583 2000', website: 'hounslow.gov.uk' },
  Islington: { name: 'London Borough of Islington', address: ['Town Hall', 'Upper Street', 'London', 'N1 2UD'], phone: '020 7527 2000', website: 'islington.gov.uk' },
  'Kensington and Chelsea': { name: 'Royal Borough of Kensington and Chelsea', address: ['The Town Hall', 'Hornton Street', 'London', 'W8 7NX'], phone: '020 7361 3000', website: 'rbkc.gov.uk' },
  'Kingston upon Thames': { name: 'Royal Borough of Kingston upon Thames', address: ['Guildhall', 'High Street', 'Kingston upon Thames', 'KT1 1EU'], phone: '020 8547 5757', website: 'kingston.gov.uk' },
  Lambeth: { name: 'London Borough of Lambeth', address: ['Lambeth Town Hall', 'Brixton Hill', 'London', 'SW2 1RW'], phone: '020 7926 1000', website: 'lambeth.gov.uk' },
  Merton: { name: 'London Borough of Merton', address: ['Civic Centre', 'London Road', 'Morden', 'SM4 5DX'], phone: '020 8274 4901', website: 'merton.gov.uk' },
  Redbridge: { name: 'London Borough of Redbridge', address: ['Town Hall', '128–142 High Road', 'Ilford', 'IG1 1DD'], phone: '020 8554 5000', website: 'redbridge.gov.uk' },
  'Richmond upon Thames': { name: 'London Borough of Richmond upon Thames', address: ['Civic Centre', '44 York Street', 'Twickenham', 'TW1 3BZ'], phone: '020 8891 1411', website: 'richmond.gov.uk' },
  Sutton: { name: 'London Borough of Sutton', address: ['Civic Offices', 'St Nicholas Way', 'Sutton', 'SM1 1EA'], phone: '020 8770 5000', website: 'sutton.gov.uk' },
  Wandsworth: { name: 'London Borough of Wandsworth', address: ['Town Hall', 'Wandsworth High Street', 'London', 'SW18 2PU'], phone: '020 8871 6000', website: 'wandsworth.gov.uk' },
}

/** Every UK postcode in a piece of text, normalised to "E15 1LU". */
export function postcodesIn(text: string | null | undefined): string[] {
  const out = new Set<string>()
  for (const m of String(text || '').toUpperCase().matchAll(/\b([A-Z]{1,2}\d[A-Z\d]?)\s*(\d[A-Z]{2})\b/g)) out.add(`${m[1]} ${m[2]}`)
  return [...out]
}

/** The council for a postcode (postcodes.io — free, no key). */
export async function councilForPostcode(postcode: string): Promise<{ district: string | null; council: Council | null; error?: string }> {
  try {
    const r = await fetch(`https://api.postcodes.io/postcodes/${encodeURIComponent(postcode.replace(/\s+/g, ''))}`, { cache: 'no-store' })
    const j = await r.json().catch(() => ({}))
    if (!r.ok || !j.result) return { district: null, council: null, error: `${postcode} wasn’t found in the postcode register` }
    const district = String(j.result.admin_district || '')
    return { district, council: LONDON_COUNCILS[district] ?? null }
  } catch {
    return { district: null, council: null, error: 'The postcode lookup didn’t respond' }
  }
}
