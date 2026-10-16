// Deposit prescribed information — one per tenancy (16 Oct 2026). The Housing Act 2004 s.213 requires the landlord
// to give the tenant (and anyone who paid the deposit for them) the "prescribed information" within 30 days of
// receiving the deposit. The contents follow the Housing (Tenancy Deposits) (Prescribed Information) Order 2007,
// art. 2: the scheme administrator's contact details; how the deposit is repaid and disputes resolved; the amount;
// the property; the landlord's and tenant's names and contact details; when deductions may be made; and a
// certificate signed by the landlord (or agent) that the information is accurate. It follows the DPS's own form
// (public/tenancy-pack/deposit-prescribed-information.pdf — the blank template), whose note 1 requires the DPS
// Terms and Conditions to be attached: public/tenancy-pack/dps-terms-and-conditions.pdf (DPS_TERMS_FILE). Without
// that file the screen won't send.
//
// Drawn as a formal letter on the letterhead (lib/letters/formalLetter). Served by email from the Deposits screen,
// which stamps tenancies.prescribed_info_served_at.
import type { SupabaseClient } from '@supabase/supabase-js'
import { dearName, displayName, landlordFormalNames } from '@/lib/people'
import { fullAddress } from '@/lib/quotes/quoteRequest'
import { oneLine, placeLabel, isWholeLet } from '@/lib/lettings/letWording'

export interface SchemeDetails { name: string; address: string; phone: string; email: string; website: string }

/** The DPS's details as we hold them — editable on the Deposits screen (system_settings deposit_scheme_details).
 *  Check them against the DPS's current leaflet: they go on a legal notice. */
export const DPS_TERMS_FILE = 'tenancy-pack/dps-terms-and-conditions.pdf'
export const DPS_GUIDE_FILE = 'tenancy-pack/deposit-protection-guide.pdf'

export const DPS_DEFAULT: SchemeDetails = {
  name: 'The Deposit Protection Service (DPS) — custodial scheme',
  address: 'The Pavilions, Bridgwater Road, Bristol, BS99 6AA',
  phone: '0330 303 0030',
  email: 'Enquiry forms at www.depositprotection.com',
  website: 'www.depositprotection.com',
}

export async function schemeDetails(s: SupabaseClient): Promise<{ details: SchemeDetails; saved: boolean }> {
  const { data } = await s.from('system_settings').select('value').eq('key', 'deposit_scheme_details').maybeSingle()
  try { if ((data as any)?.value) return { details: { ...DPS_DEFAULT, ...JSON.parse((data as any).value) }, saved: true } } catch { /* fall through */ }
  return { details: DPS_DEFAULT, saved: false }
}

export interface PIContext {
  tenancyId: string
  tenants: { name: string; dear: string; email: string; phone: string }[]
  property: string
  landlord: string
  agentAddress: string
  agentEmail: string
  agentPhone: string
  deposit: number
  startDate: string | null
  schemeRef: string | null
  protectedAt: string | null
  scheme: SchemeDetails
}

const gbp = (n: number) => '£' + n.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const day = (iso: string | null) => iso ? new Date(iso + 'T12:00:00Z').toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }) : '—'

export async function loadPI(s: SupabaseClient, tenancyId: string, biz: { address_line1: string; city: string; postcode: string; email: string; phone: string }): Promise<PIContext | null> {
  const { data: t } = await s.from('tenancies')
    .select('id, start_date, deposit_amount, deposit_scheme_ref, deposit_protected_at, property_id, room_id, people!person_id(salutation, first_name, middle_name, last_name, full_name, email, phone), co:people!co_tenant_id(salutation, first_name, middle_name, last_name, full_name, email, phone), rooms(name)')
    .eq('id', tenancyId).maybeSingle() as { data: any }
  if (!t) return null
  const { data: prop } = await s.from('properties').select('name, address, postcode, property_type, landlord_id').eq('id', t.property_id).maybeSingle() as { data: any }
  const { data: ll } = prop?.landlord_id ? await s.from('people').select('*').eq('id', prop.landlord_id).maybeSingle() as { data: any } : { data: null }
  const house = fullAddress(null, oneLine([prop?.name, prop?.address].filter(Boolean).join('\n')), prop?.postcode)
  const tenants = [t.people, t.co].filter(Boolean).map((p: any) => ({ name: displayName(p), dear: dearName(p), email: p.email || '', phone: p.phone || '' }))
  return {
    tenancyId, tenants,
    property: placeLabel(isWholeLet(prop?.property_type, t.rooms?.name), t.rooms?.name, house),
    landlord: ll ? landlordFormalNames(ll) : 'The landlord',
    agentAddress: ['Capital Rooms Ltd', biz.address_line1, biz.city, biz.postcode].filter(Boolean).join(', '),
    agentEmail: biz.email, agentPhone: biz.phone,
    deposit: Number(t.deposit_amount || 0), startDate: t.start_date ?? null,
    schemeRef: t.deposit_scheme_ref ?? null, protectedAt: t.deposit_protected_at ?? null,
    scheme: (await schemeDetails(s)).details,
  }
}

/** What stops it being served: it must name the protection reference and date. */
export function piGaps(c: PIContext): string[] {
  return [
    !(c.deposit > 0) && 'the deposit amount',
    !c.schemeRef && 'the DPS reference (record the protection first)',
    !c.protectedAt && 'the date it was protected',
    !c.tenants.length && 'the tenant',
  ].filter(Boolean) as string[]
}

export const piSubject = (c: PIContext) => `Your tenancy deposit — prescribed information for ${c.property}`

/** The letter body in lib/letters/formalLetter's text format (## headings, - bullets, | tables |, **bold**). */
export function piBody(c: PIContext): string {
  const tenantRows = c.tenants.map(t => `| ${t.name} | ${t.email || '—'} | ${t.phone || '—'} |`).join('\n')
  return `This is the **prescribed information** about your tenancy deposit, which the law requires us to give you (Housing Act 2004, section 213, and the Housing (Tenancy Deposits) (Prescribed Information) Order 2007). Please keep it safe with your tenancy agreement. The DPS Terms and Conditions are attached: they are the full rules of the scheme, and the summaries below are only a guide to them.

## Your deposit
| Item | Details |
|---|---|
| Amount of deposit | **${gbp(c.deposit)}** |
| Property | ${c.property} |
| Tenancy start date | ${day(c.startDate)} |
| Protected with | ${c.scheme.name} |
| Deposit reference (DAN) | **${c.schemeRef ?? '—'}** |
| Date protected | ${day(c.protectedAt)} |

## The scheme administrator
| Item | Details |
|---|---|
| Name | ${c.scheme.name} |
| Address | ${c.scheme.address} |
| Telephone | ${c.scheme.phone} |
| Email | ${c.scheme.email} |
| Website | ${c.scheme.website} |

## The landlord, and us as their agent
| Item | Details |
|---|---|
| Landlord | ${c.landlord} |
| Address for the landlord | c/o ${c.agentAddress} |
| Agent | Capital Rooms Ltd, ${c.agentAddress.replace(/^Capital Rooms Ltd,\\s*/, '')} |
| Telephone | ${c.agentPhone} |
| Email | ${c.agentEmail} |

## You, the tenant${c.tenants.length > 1 ? 's' : ''}
| Name | Email | Telephone |
|---|---|---|
${tenantRows}

Your address during the tenancy is the property above. **Contact address to be used at the end of the tenancy:** please tell us (and the DPS) an address and email we can use after you move out, so the deposit can be returned to you. It is your responsibility${c.tenants.length > 1 ? ' (or the lead tenant’s)' : ''} to register your contact address with the DPS and keep it up to date at the end of the tenancy.
${c.tenants.length > 1 ? '\nAs joint tenants, you agree that a lead tenant is nominated by all of you to deal with the DPS, and that you understand the lead tenant’s responsibilities (section 8 of the DPS Terms and Conditions).\n' : ''}
**Third party:** if anyone else paid any of the deposit for you, please tell us their name, address and contact details — they are a “relevant person” and must be given this information too.

## How the deposit is repaid at the end of the tenancy
- The deposit is held by the DPS in its custodial scheme, not by us or the landlord.
- When the tenancy ends, we will tell you of any deductions the landlord proposes, with the reasons. Either you or we can then ask the DPS to repay the deposit through its online service.
- Once you and the landlord agree how it should be split, the DPS repays the agreed amounts, normally within 5 working days.
- You are entitled to have the deposit back in full, less only deductions you agree to or that the DPS’s adjudicator decides are due.

## If either side can’t be contacted
If you or the landlord don’t respond to a repayment request, the other side can ask the DPS to repay the deposit using its procedure for when one party cannot be contacted (a statutory declaration). The DPS will tell the other party and give them the chance to respond before any money is paid out. Full details are in the DPS leaflet.

## If you don’t agree about deductions
Any amount in dispute stays protected with the DPS. The DPS offers a **free alternative dispute resolution (ADR) service**: an independent adjudicator decides on the written evidence from both sides. Using it is voluntary — you can go to court instead — but both sides must agree to it. The DPS repays any amount that isn’t in dispute straight away.

## When deductions may be made
The landlord may keep all or part of the deposit in the circumstances set out in **clause 5 (The deposit) of your tenancy agreement**. In summary, deductions may be made for:
- rent, or any other money you owe under the agreement, that is unpaid at the end of the tenancy;
- damage to the property or its contents, beyond fair wear and tear;
- cleaning needed to return the property to the condition at the start, allowing for fair wear and tear;
- missing items listed in the inventory, and keys or entry devices not returned;
- bills you are responsible for under the agreement that are unpaid;
- any other breach of the tenancy agreement that leaves the landlord out of pocket.
Every deduction must be reasonable and supported by evidence, such as the check-in and check-out inventories.

## Certificate
I, as agent for and on behalf of the landlord, certify that:
- the information provided is accurate to the best of my knowledge and belief; and
- the tenant${c.tenants.length > 1 ? 's have' : ' has'} been given the opportunity to sign this document by way of confirmation that the information is accurate to the best of ${c.tenants.length > 1 ? 'their' : 'their'} knowledge and belief.

**Tenant confirmation** — I have received this information and the DPS Terms and Conditions, and confirm it is accurate.
| Tenant | Signature | Date |
|---|---|---|
${c.tenants.map(t => `| ${t.name} | | |`).join('\n')}`
}
