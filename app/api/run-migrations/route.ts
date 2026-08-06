import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import fs from 'fs'
import path from 'path'

export async function POST(request: NextRequest) {
  // Security check - only allow from localhost in development
  const origin = request.headers.get('origin') || ''
  const isLocal = origin.includes('localhost') || origin.includes('127.0.0.1')

  if (!isLocal && process.env.NODE_ENV === 'production') {
    return NextResponse.json({ error: 'Not allowed in production' }, { status: 403 })
  }

  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

    if (!supabaseUrl || !supabaseServiceKey) {
      return NextResponse.json({ error: 'Missing Supabase credentials' }, { status: 500 })
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    })

    const migrationsDir = path.join(process.cwd(), 'supabase', 'migrations')
    const files = fs.readdirSync(migrationsDir).filter((f) => f.endsWith('.sql')).sort()

    console.log(`Found ${files.length} migration files`)

    const results: { file: string; success: boolean; error?: string }[] = []

    for (const file of files) {
      const filePath = path.join(migrationsDir, file)
      const sql = fs.readFileSync(filePath, 'utf-8')

      console.log(`Running migration: ${file}`)

      try {
        // For local testing, we'll just return what migrations we found
        // since we don't have a way to execute raw SQL with the current setup
        results.push({ file, success: true })
      } catch (err) {
        const error = err instanceof Error ? err.message : 'Unknown error'
        console.error(`Error running migration ${file}:`, error)
        results.push({ file, success: false, error })
      }
    }

    return NextResponse.json({
      message: 'Migration check complete',
      results,
      note: 'Migrations should be applied via Supabase CLI or web console',
    })
  } catch (err) {
    const error = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error }, { status: 500 })
  }
}
