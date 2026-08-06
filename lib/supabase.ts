import { createClient as createSupabaseClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase environment variables')
}

export function createClient() {
  return createSupabaseClient(supabaseUrl, supabaseAnonKey)
}

export type UserRole = 'administrator' | 'tenant' | 'contractor' | 'cleaner' | 'landlord' | 'lettings'

export interface UserAssignment {
  id: string
  email: string
  role: UserRole
  property_id?: string
  room_id?: string
  created_at: string
  updated_at: string
}
