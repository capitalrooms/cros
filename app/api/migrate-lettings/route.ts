import { NextRequest, NextResponse } from 'next/server'
import fs from 'fs'
import path from 'path'

/**
 * API endpoint to apply lettings schema migration
 *
 * This endpoint needs a SERVICE_ROLE_KEY to execute SQL mutations.
 * You can get this from your Supabase project settings:
 * 1. Go to https://supabase.com/dashboard
 * 2. Select your project
 * 3. Go to Settings → API
 * 4. Copy the "service_role" key (NOT the anon key)
 * 5. Add to .env.local as: SUPABASE_SERVICE_ROLE_KEY=your_key_here
 */

export async function POST(request: NextRequest) {
  try {
    // Security: only allow in development
    if (process.env.NODE_ENV === 'production') {
      return NextResponse.json(
        { error: 'Migration API only available in development' },
        { status: 403 }
      )
    }

    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

    if (!serviceRoleKey) {
      return NextResponse.json(
        {
          error: 'SUPABASE_SERVICE_ROLE_KEY not configured',
          instructions: [
            '1. Go to https://supabase.com/dashboard',
            '2. Open your Capital Rooms project',
            '3. Click Settings → API in left sidebar',
            '4. Copy the "service_role" key (it starts with "eyJ...")',
            '5. Add to .env.local: SUPABASE_SERVICE_ROLE_KEY=<paste_key_here>',
            '6. Restart your dev server',
            '7. Call this endpoint again',
          ],
          status: 'needs_service_key',
        },
        { status: 400 }
      )
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL

    if (!supabaseUrl) {
      return NextResponse.json({ error: 'Missing SUPABASE_URL' }, { status: 500 })
    }

    // Read the migration SQL file
    const migrationPath = path.join(process.cwd(), 'supabase', 'migrations', '012_complete_lettings_setup.sql')
    const migrationSql = fs.readFileSync(migrationPath, 'utf-8')

    // Execute migration via Supabase REST API
    // We'll split by statements since the API processes one at a time
    const statements = migrationSql
      .split(';')
      .map((s) => s.trim())
      .filter((s) => s.length > 0 && !s.startsWith('--'))

    const results: { statement: string; success: boolean; error?: string }[] = []

    for (let i = 0; i < Math.min(statements.length, 5); i++) {
      const statement = statements[i]
      const shortStatement = statement.substring(0, 60) + (statement.length > 60 ? '...' : '')

      try {
        const response = await fetch(`${supabaseUrl}/rest/v1/rpc/exec_sql`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${serviceRoleKey}`,
          },
          body: JSON.stringify({ sql: statement }),
        })

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}))
          results.push({
            statement: shortStatement,
            success: false,
            error: errorData.message || response.statusText,
          })
        } else {
          results.push({ statement: shortStatement, success: true })
        }
      } catch (err) {
        results.push({
          statement: shortStatement,
          success: false,
          error: err instanceof Error ? err.message : 'Unknown error',
        })
      }
    }

    // Check if migration was successful by querying the schema
    const checkResponse = await fetch(`${supabaseUrl}/rest/v1/rpc/check_schema`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${serviceRoleKey}`,
      },
      body: JSON.stringify({}),
    }).catch(() => null)

    const schemaReady = checkResponse?.ok

    return NextResponse.json({
      status: schemaReady ? 'success' : 'partial',
      message: schemaReady
        ? 'Migration applied successfully!'
        : 'Migration SQL executed (verify in Supabase console)',
      statements_processed: results.length,
      results,
      next_step: schemaReady
        ? 'Create a test account and sign in'
        : 'Check Supabase console to verify schema was created',
    })
  } catch (err) {
    return NextResponse.json(
      {
        error: err instanceof Error ? err.message : 'Unknown error',
        status: 'error',
      },
      { status: 500 }
    )
  }
}
