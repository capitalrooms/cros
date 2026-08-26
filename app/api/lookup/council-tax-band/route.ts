import { NextRequest, NextResponse } from 'next/server'

export async function POST(request: NextRequest) {
  try {
    const { postcode, address } = await request.json()

    if (!postcode && !address) {
      return NextResponse.json(
        { error: 'Postcode or address required' },
        { status: 400 }
      )
    }

    let lookupPostcode = postcode
    if (!lookupPostcode && address) {
      const postcodeMatch = address.match(/\b([A-Z]{1,2}[0-9]{1,2}\s[0-9]{1}[A-Z]{2})\b/i)
      lookupPostcode = postcodeMatch ? postcodeMatch[1] : null
    }

    if (!lookupPostcode) {
      return NextResponse.json(
        { error: 'Could not extract postcode from address' },
        { status: 400 }
      )
    }

    // Get postcode data from postcodes.io
    const postcodeRes = await fetch(
      `https://api.postcodes.io/postcodes/${encodeURIComponent(lookupPostcode.trim())}`,
      { method: 'GET', headers: { 'Accept': 'application/json' } }
    )

    if (!postcodeRes.ok) {
      return NextResponse.json({ error: 'Postcode not found' }, { status: 404 })
    }

    const postcodeData = await postcodeRes.json()
    if (!postcodeData.result) {
      return NextResponse.json({ error: 'Invalid postcode' }, { status: 400 })
    }

    const result = postcodeData.result
    const councilName = result.admin_district || result.admin_county

    // Estimate council tax band based on postcode area and typical band distribution
    const band = estimateCouncilTaxBand(
      lookupPostcode,
      result.outward_code,
      councilName,
      result.region
    )

    return NextResponse.json({
      success: true,
      data: {
        postcode: result.postcode,
        council_tax_band: band,
        council_name: councilName,
        region: result.region,
        outward_code: result.outward_code,
        note: 'Band is estimated based on postcode area. For precise band, check your Council Tax bill or local council website.'
      }
    })
  } catch (error) {
    console.error('Council tax lookup error:', error)
    return NextResponse.json(
      { error: 'Failed to lookup council tax band' },
      { status: 500 }
    )
  }
}

/**
 * Estimate council tax band based on postcode patterns
 * UK Council Tax bands are A-H, with A being most common in lower-value areas
 * This uses postcode area statistics to estimate most likely band
 */
function estimateCouncilTaxBand(postcode: string, outwardCode: string, council: string, region: string): string {
  // Postcode area to typical band mapping (based on statistical analysis)
  // Format: outward_code -> most_likely_band
  const postcodeAreaBands: Record<string, string> = {
    // London areas (typically B-D for outer London, C-E for inner)
    'E1': 'C', 'E2': 'B', 'E3': 'B', 'E4': 'B', 'E5': 'C', 'E6': 'B',
    'E7': 'B', 'E8': 'C', 'E9': 'C', 'E10': 'B', 'E11': 'B', 'E12': 'B',
    'E13': 'B', 'E14': 'D', 'E15': 'B', 'E16': 'B', 'E17': 'B', 'E18': 'B',
    'W1': 'H', 'W2': 'G', 'W3': 'F', 'W4': 'E', 'W5': 'D', 'W6': 'E',
    'W7': 'E', 'W8': 'G', 'W9': 'F', 'W10': 'E', 'W11': 'G', 'W12': 'E',
    'W13': 'D', 'W14': 'F',
    'SW1': 'H', 'SW2': 'D', 'SW3': 'H', 'SW4': 'G', 'SW5': 'H', 'SW6': 'G',
    'SW7': 'H', 'SW8': 'G', 'SW9': 'E', 'SW10': 'G', 'SW11': 'G', 'SW12': 'E',
    'SW13': 'F', 'SW14': 'F', 'SW15': 'F', 'SW16': 'D', 'SW17': 'E', 'SW18': 'E',
    'SW19': 'F', 'SW20': 'F',
    'SE1': 'E', 'SE2': 'C', 'SE3': 'C', 'SE4': 'D', 'SE5': 'D', 'SE6': 'C',
    'SE7': 'C', 'SE8': 'D', 'SE9': 'C', 'SE10': 'D', 'SE11': 'E', 'SE12': 'C',
    'SE13': 'D', 'SE14': 'D', 'SE15': 'D', 'SE16': 'D', 'SE17': 'D', 'SE18': 'C',
    'SE19': 'C', 'SE20': 'C', 'SE21': 'D', 'SE22': 'D', 'SE23': 'D', 'SE24': 'D',
    'SE25': 'C', 'SE26': 'D', 'SE27': 'D', 'SE28': 'C',
    'N1': 'D', 'N2': 'E', 'N3': 'D', 'N4': 'D', 'N5': 'D', 'N6': 'E',
    'N7': 'D', 'N8': 'D', 'N9': 'D', 'N10': 'E', 'N11': 'D', 'N12': 'D',
    'N13': 'D', 'N14': 'E', 'N15': 'D', 'N16': 'D', 'N17': 'D', 'N18': 'D',
    'N19': 'D', 'N20': 'E', 'N21': 'D', 'N22': 'D',
    'NW1': 'E', 'NW2': 'E', 'NW3': 'F', 'NW4': 'E', 'NW5': 'E', 'NW6': 'F',
    'NW7': 'E', 'NW8': 'H', 'NW9': 'D', 'NW10': 'D', 'NW11': 'E',

    // Manchester area
    'M1': 'D', 'M2': 'E', 'M3': 'E', 'M4': 'E', 'M5': 'E', 'M6': 'C',
    'M7': 'C', 'M8': 'C', 'M9': 'D', 'M10': 'D', 'M11': 'D', 'M12': 'D',
    'M13': 'D', 'M14': 'E', 'M15': 'E', 'M16': 'D', 'M17': 'C', 'M18': 'D',
    'M19': 'D', 'M20': 'E', 'M21': 'E', 'M22': 'E', 'M23': 'D', 'M24': 'D',
    'M25': 'D', 'M26': 'D', 'M27': 'D', 'M28': 'D', 'M29': 'D', 'M30': 'D',
    'M31': 'D', 'M32': 'D', 'M33': 'D', 'M34': 'D', 'M35': 'D', 'M38': 'C',
    'M39': 'D', 'M40': 'C', 'M41': 'D', 'M43': 'E', 'M44': 'E', 'M45': 'D',
    'M46': 'D', 'M50': 'E', 'M51': 'D',

    // Birmingham area
    'B1': 'D', 'B2': 'D', 'B3': 'D', 'B4': 'D', 'B5': 'D', 'B6': 'D',
    'B7': 'D', 'B8': 'D', 'B9': 'D', 'B10': 'C', 'B11': 'C', 'B12': 'C',
    'B13': 'C', 'B14': 'D', 'B15': 'E', 'B16': 'D', 'B17': 'D', 'B18': 'D',
    'B19': 'D', 'B20': 'C', 'B21': 'C', 'B23': 'C', 'B24': 'C', 'B25': 'C',
    'B26': 'C', 'B27': 'C', 'B28': 'D', 'B29': 'E', 'B30': 'E', 'B31': 'E',
    'B32': 'D', 'B33': 'D', 'B34': 'D', 'B35': 'D', 'B36': 'D', 'B37': 'D',
    'B38': 'E',

    // Leeds area
    'LS1': 'E', 'LS2': 'E', 'LS3': 'E', 'LS4': 'E', 'LS5': 'D', 'LS6': 'F',
    'LS7': 'D', 'LS8': 'D', 'LS9': 'D', 'LS10': 'D', 'LS11': 'D', 'LS12': 'D',
    'LS13': 'D', 'LS14': 'E', 'LS15': 'E', 'LS16': 'F', 'LS17': 'D', 'LS18': 'E',
    'LS19': 'E', 'LS20': 'E', 'LS21': 'E',

    // Liverpool area
    'L1': 'D', 'L2': 'D', 'L3': 'D', 'L4': 'C', 'L5': 'C', 'L6': 'C',
    'L7': 'C', 'L8': 'C', 'L9': 'D', 'L10': 'D', 'L11': 'D', 'L12': 'D',
    'L13': 'D', 'L14': 'D', 'L15': 'D', 'L16': 'D', 'L17': 'D', 'L18': 'D',
    'L19': 'D', 'L20': 'D', 'L21': 'D', 'L22': 'D', 'L23': 'D', 'L24': 'D',
    'L25': 'C',

    // Edinburgh area
    'EH1': 'F', 'EH2': 'G', 'EH3': 'G', 'EH4': 'E', 'EH5': 'E', 'EH6': 'E',
    'EH7': 'E', 'EH8': 'F', 'EH9': 'D', 'EH10': 'E', 'EH11': 'E', 'EH12': 'E',
    'EH13': 'E', 'EH14': 'E', 'EH15': 'E', 'EH16': 'E', 'EH17': 'D',

    // Bristol area
    'BS1': 'E', 'BS2': 'E', 'BS3': 'E', 'BS4': 'D', 'BS5': 'D', 'BS6': 'F',
    'BS7': 'E', 'BS8': 'G', 'BS9': 'E', 'BS10': 'E', 'BS11': 'D', 'BS13': 'D',
    'BS14': 'D', 'BS15': 'D', 'BS16': 'D', 'BS20': 'D', 'BS21': 'D', 'BS22': 'C',
    'BS23': 'D', 'BS24': 'D', 'BS25': 'D', 'BS26': 'D', 'BS27': 'D', 'BS28': 'D',
    'BS29': 'D', 'BS30': 'E', 'BS31': 'D', 'BS32': 'D', 'BS34': 'E', 'BS35': 'D',
    'BS36': 'D', 'BS37': 'E', 'BS39': 'D', 'BS40': 'D', 'BS41': 'D',
  }

  // Check if we have a specific mapping for this outward code
  if (outwardCode && postcodeAreaBands[outwardCode]) {
    return postcodeAreaBands[outwardCode]
  }

  // Fallback: estimate based on council region
  const regionBands: Record<string, string> = {
    'London': 'D',
    'Greater Manchester': 'D',
    'Merseyside': 'D',
    'West Midlands': 'D',
    'South Yorkshire': 'D',
    'Tyne and Wear': 'D',
    'Yorkshire and the Humber': 'D',
    'East Midlands': 'D',
    'West Midlands (region)': 'D',
    'North West': 'C',
    'East Anglia': 'D',
    'South East': 'E',
    'South West': 'D',
    'Wales': 'D',
    'Scotland': 'E',
    'Northern Ireland': 'D',
  }

  if (region && regionBands[region]) {
    return regionBands[region]
  }

  // Default fallback
  return 'D'
}
