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

    // Extract postcode from address if not provided
    let lookupPostcode = postcode
    if (!lookupPostcode && address) {
      // Simple regex to extract UK postcode (e.g., "M1 1AA")
      const postcodeMatch = address.match(/\b([A-Z]{1,2}[0-9]{1,2}\s[0-9]{1}[A-Z]{2})\b/i)
      lookupPostcode = postcodeMatch ? postcodeMatch[1] : null
    }

    if (!lookupPostcode) {
      return NextResponse.json(
        { error: 'Could not extract postcode from address' },
        { status: 400 }
      )
    }

    // Call UK Postcode Lookup API (free tier available)
    const apiResponse = await fetch(
      `https://api.postcodes.io/postcodes/${encodeURIComponent(lookupPostcode.trim())}`,
      {
        method: 'GET',
        headers: { 'Accept': 'application/json' }
      }
    )

    if (!apiResponse.ok) {
      return NextResponse.json(
        { error: 'Postcode not found' },
        { status: 404 }
      )
    }

    const postcodeData = await apiResponse.json()

    if (!postcodeData.result) {
      return NextResponse.json(
        { error: 'Invalid postcode' },
        { status: 400 }
      )
    }

    const result = postcodeData.result

    // Extract council information
    const councilInfo = {
      postcode: result.postcode,
      council_name: result.admin_district || result.admin_county || null,
      council_tax_band: null, // Postcode API doesn't provide this; would need separate lookup
      region: result.region || null,
      country: result.country || null,
      latitude: result.latitude,
      longitude: result.longitude,

      // Additional useful info
      outward_code: result.outward_code,
      inward_code: result.inward_code
    }

    // If we have a council name, lookup its contact info and bin schedule
    if (councilInfo.council_name) {
      // Try to lookup council contact details from our own data or external API
      const councilDetails = await getCouncilContactInfo(councilInfo.council_name)

      return NextResponse.json({
        success: true,
        data: {
          ...councilInfo,
          ...councilDetails
        }
      })
    }

    return NextResponse.json({
      success: true,
      data: councilInfo
    })

  } catch (error) {
    console.error('Council lookup error:', error)
    return NextResponse.json(
      { error: 'Failed to lookup council information' },
      { status: 500 }
    )
  }
}

// Helper function to get council contact details
async function getCouncilContactInfo(councilName: string) {
  // This is a simplified lookup - in production you'd use a more comprehensive database
  // For now, return a basic structure that can be populated from user input or external data

  const councilMap: Record<string, any> = {
    'Manchester': { council_email: 'contact@manchester.gov.uk', council_phone: '0161 234 5000', council_website: 'https://www.manchester.gov.uk' },
    'London': { council_email: 'info@london.gov.uk', council_phone: '020 7983 4000', council_website: 'https://www.london.gov.uk' },
    'Birmingham': { council_email: 'contact@birminghamcitycouncil.gov.uk', council_phone: '0121 303 1234', council_website: 'https://www.birmingham.gov.uk' },
    'Leeds': { council_email: 'customer.services@leeds.gov.uk', council_phone: '0113 243 3144', council_website: 'https://www.leeds.gov.uk' },
    'Bristol': { council_email: 'info@bristol.gov.uk', council_phone: '0117 922 2000', council_website: 'https://www.bristol.gov.uk' },
    'Newcastle upon Tyne': { council_email: 'customerservices@newcastle.gov.uk', council_phone: '0191 232 8520', council_website: 'https://www.newcastle.gov.uk' },
    'Sheffield': { council_email: 'enquiries@sheffield.gov.uk', council_phone: '0114 273 4567', council_website: 'https://www.sheffield.gov.uk' },
    'Leicester': { council_email: 'contact@leicester.gov.uk', council_phone: '0116 254 9898', council_website: 'https://www.leicester.gov.uk' },
    'Coventry': { council_email: 'contact@coventry.gov.uk', council_phone: '0247 623 8000', council_website: 'https://www.coventry.gov.uk' },
    'Nottingham': { council_email: 'contact@nottinghamcity.gov.uk', council_phone: '0115 876 5000', council_website: 'https://www.nottinghamcity.gov.uk' },
    'Wolverhampton': { council_email: 'customer.services@wolverhampton.gov.uk', council_phone: '01902 550 550', council_website: 'https://www.wolverhampton.gov.uk' },
    'Southwark': { council_email: 'info@southwark.gov.uk', council_phone: '020 7525 5000', council_website: 'https://www.southwark.gov.uk' },
    'Tower Hamlets': { council_email: 'enquiry@towerhamlets.gov.uk', council_phone: '020 7364 5000', council_website: 'https://www.towerhamlets.gov.uk' },
    'Hackney': { council_email: 'contact@hackney.gov.uk', council_phone: '020 8356 5000', council_website: 'https://www.hackney.gov.uk' }
  }

  return councilMap[councilName] || {
    council_email: null,
    council_phone: null,
    council_website: null,
    bin_collection_day: null,
    bin_collection_info: null
  }
}
