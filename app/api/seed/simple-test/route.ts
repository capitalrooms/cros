import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase'

/**
 * Simple test - try to read data
 */
export async function GET() {
  try {
    const supabase = createClient()

    // Try to read statements
    const { data, error } = await supabase
      .from('landlord_statements')
      .select('*')
      .limit(1)

    if (error) {
      return NextResponse.json({
        error: error.message,
        code: error.code,
      }, { status: 500 })
    }

    return NextResponse.json({
      count: data?.length || 0,
      sample: data?.[0],
    })
  } catch (error) {
    return NextResponse.json({
      error: String(error),
    }, { status: 500 })
  }
}
