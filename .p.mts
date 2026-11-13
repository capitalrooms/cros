import 'dotenv/config'
import { config } from 'dotenv'; config({ path: '.env.local', override: true })
import { createClient } from '@supabase/supabase-js'
const { loadPackContext, payeeBank, renderAgreement } = await import('./lib/movein/pack.ts')
const s = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } })
const { data: ppl } = await s.from('people').select('id, first_name, last_name').ilike('first_name', 'ziqing%')
console.log('people', ppl)
for (const p of ppl ?? []) {
  const { data: ts } = await s.from('tenancies').select('id, start_date').eq('person_id', p.id)
  for (const t of ts ?? []) {
    const ctx: any = await loadPackContext(s as any, t.id)
    console.log(t, ctx?.property?.name, ctx?.lettingType, ctx?.landlordBank)
    try { console.log('payee', payeeBank(ctx)) } catch (e: any) { console.log('payee ERR', e.message) }
    try { const pdf = await renderAgreement(ctx); console.log('agreement bytes', pdf.length) } catch (e: any) { console.log('agr ERR', e.message) }
  }
}
