// Area pages on the website (9 Nov 2026): one page for each part of London where we let and manage homes. Homes are
// placed on the nearest area (within ~2.2km of its centre). Facts are kept plain and checkable: transport, zone,
// what's nearby. Rents shown come from our own rooms in that area, never guesses.
export interface Area {
  slug: string; name: string; districts: string[]; lat: number; lng: number; zone: string
  stations: string[]; intro: string; living: string[]; landlords: string; nearby: string[]
}

export const AREAS: Area[] = [
  { slug: 'stratford', name: 'Stratford', districts: ['E15'], lat: 51.5416, lng: -0.0034, zone: 'Zones 2 and 3',
    stations: ['Stratford: Central, Jubilee and Elizabeth lines, DLR and Overground', 'Maryland: Elizabeth line', 'Stratford High Street: DLR'],
    intro: 'Stratford is one of the best connected places in London, with five rail and Tube lines in one station and the Elizabeth line reaching Liverpool Street in around seven minutes. We manage several shared houses here, close to the station and the Olympic Park.',
    living: ['Queen Elizabeth Olympic Park on the doorstep', 'Westfield Stratford City for shopping, gyms and cinemas', 'Quick to Canary Wharf, the City and the West End'],
    landlords: 'Stratford rooms let quickly to professionals working in the City and Canary Wharf, which makes it a strong area for shared houses. We look after HMOs here room by room.',
    nearby: ['canning-town', 'east-ham', 'canary-wharf'] },
  { slug: 'canada-water', name: 'Canada Water', districts: ['SE16'], lat: 51.4980, lng: -0.0497, zone: 'Zone 2',
    stations: ['Canada Water: Jubilee line and Overground', 'Surrey Quays: Overground'],
    intro: 'Canada Water sits between Rotherhithe and Surrey Quays, around the dock that gives it its name. The Jubilee line gets you to London Bridge in about four minutes and Canary Wharf in about two, which is why so many of our tenants here work in the City or at the Wharf.',
    living: ['The dock, Greenland Dock and the Thames Path for walks and runs', 'Southwark Park close by', 'Two stops to London Bridge on the Jubilee line'],
    landlords: 'Canada Water and the rest of SE16 is our busiest area. We let and manage flats and rooms here, and know what each street and building lets for.',
    nearby: ['rotherhithe', 'deptford', 'canary-wharf'] },
  { slug: 'rotherhithe', name: 'Rotherhithe and Surrey Quays', districts: ['SE16'], lat: 51.4985, lng: -0.0350, zone: 'Zone 2',
    stations: ['Rotherhithe: Overground', 'Surrey Quays: Overground', 'Canada Water: Jubilee line and Overground'],
    intro: 'Rotherhithe is a quiet riverside corner of south east London, with old warehouses, new flats and the Thames on three sides. Surrey Quays and Canada Water stations put the City and Canary Wharf within a few minutes.',
    living: ['Riverside walks along the Thames Path', 'Russia Dock Woodland and Southwark Park', 'Easy reach of Canary Wharf, London Bridge and Shoreditch'],
    landlords: 'Riverside flats and rooms in Rotherhithe are popular with tenants who want space and quiet close to central London. We let and manage several homes here.',
    nearby: ['canada-water', 'deptford', 'canary-wharf'] },
  { slug: 'deptford', name: 'Deptford', districts: ['SE8'], lat: 51.4780, lng: -0.0260, zone: 'Zone 2',
    stations: ['Deptford: Southeastern trains to London Bridge', 'Deptford Bridge: DLR', 'New Cross: Overground'],
    intro: 'Deptford is a lively, creative part of south east London next to Greenwich, with a busy high street market and trains to London Bridge in under ten minutes. We manage shared houses here for tenants who want character and good value.',
    living: ['Deptford High Street market and independent cafes', 'Greenwich Park and the river a short walk away', 'Fast trains to London Bridge and the DLR to Canary Wharf'],
    landlords: 'Deptford has steady demand from students, creatives and young professionals. Shared houses here let well when they are kept in good order, which is what we do.',
    nearby: ['rotherhithe', 'canada-water', 'canary-wharf'] },
  { slug: 'canary-wharf', name: 'Canary Wharf', districts: ['E14'], lat: 51.5054, lng: -0.0235, zone: 'Zone 2',
    stations: ['Canary Wharf: Jubilee and Elizabeth lines, DLR', 'Westferry, Poplar and Limehouse: DLR'],
    intro: 'Canary Wharf and the Isle of Dogs are home to many of the people who work there, with the Jubilee line, the Elizabeth line and the DLR all on hand. We let flats here to professionals who want to walk to work.',
    living: ['Walk to work at the Wharf', 'Shops, restaurants and the waterfront', 'Elizabeth line to Liverpool Street and Bond Street'],
    landlords: 'Flats in Canary Wharf let to professionals, often relocating, who expect a smooth, quick move. We handle the whole let, from photos to the move-in.',
    nearby: ['canada-water', 'canning-town', 'stratford'] },
  { slug: 'canning-town', name: 'Canning Town and the Royal Docks', districts: ['E16'], lat: 51.5110, lng: 0.0300, zone: 'Zones 2 and 3',
    stations: ['Canning Town: Jubilee line and DLR', 'Custom House: Elizabeth line and DLR', 'Royal Victoria: DLR'],
    intro: 'Canning Town and the Royal Docks have changed fast, with new homes around Royal Victoria Dock, ExCeL London and the Elizabeth line at Custom House. Canary Wharf is one stop away on the Jubilee line.',
    living: ['Royal Victoria Dock and the waterfront', 'ExCeL London and the cable car over the river', 'One stop to Canary Wharf, quick to Stratford'],
    landlords: 'The Royal Docks attract professionals who want new-build homes close to Canary Wharf. We let and manage rooms and flats here.',
    nearby: ['canary-wharf', 'east-ham', 'stratford'] },
  { slug: 'east-ham', name: 'East Ham', districts: ['E6'], lat: 51.5340, lng: 0.0520, zone: 'Zones 3 and 4',
    stations: ['East Ham: District and Hammersmith & City lines', 'Beckton and Gallions Reach: DLR'],
    intro: 'East Ham offers good value rooms with the District and Hammersmith & City lines running straight into the City. We manage shared houses here for tenants who want more space for their money.',
    living: ['Central Park and East Ham Nature Reserve', 'Direct Tube to the City, Whitechapel and Liverpool Street', 'Quick to Stratford and the Royal Docks'],
    landlords: 'East Ham has strong demand for well-run shared houses at sensible rents. We look after HMOs here, including licensing with Newham Council.',
    nearby: ['stratford', 'canning-town'] },
  { slug: 'pimlico', name: 'Pimlico', districts: ['SW1V'], lat: 51.4893, lng: -0.1334, zone: 'Zone 1',
    stations: ['Pimlico: Victoria line', 'Victoria: Victoria, District and Circle lines, mainline trains'],
    intro: 'Pimlico is a calm, central part of Westminster, with white stucco terraces, the Thames and Victoria station a short walk away. We let rooms here for people who want to live in Zone 1.',
    living: ['Walk to Westminster, Victoria and Chelsea', 'Tate Britain and the Thames on the doorstep', 'Victoria line straight to Oxford Circus and King’s Cross'],
    landlords: 'Pimlico rooms and flats let to professionals who want a central address. We find tenants and manage the home for you.',
    nearby: ['canada-water', 'rotherhithe'] },
]

export const areaBySlug = (slug: string) => AREAS.find(a => a.slug === slug) ?? null
const K = Math.cos(51.5 * Math.PI / 180)
/** the area a home belongs to: the nearest centre within ~2.2km, else null */
export function areaFor(lat: number | null, lng: number | null): Area | null {
  if (lat == null || lng == null) return null
  let best: Area | null = null, bd = Infinity
  for (const a of AREAS) { const d = Math.hypot((a.lat - lat) * 111.32, (a.lng - lng) * 111.32 * K); if (d < bd) { bd = d; best = a } }
  return bd <= 2.2 ? best : null
}

/** what the rooms we manage in each area are advertised at (our own rooms only; at least 3 to show a range) */
export async function areaRoomRents(): Promise<Record<string, { from: number; to: number; count: number }>> {
  const { createServiceClient } = await import('@/lib/supabase')
  const { isWholeLet } = await import('@/lib/lettings/letWording')
  const s = createServiceClient() as any
  const { data } = await s.from('rooms').select('name, current_asking_rent, properties(postcode, property_type, is_demo, lat, lng)').not('current_asking_rent', 'is', null)
  const out: Record<string, number[]> = {}
  for (const r of (data ?? []) as any[]) {
    const p = r.properties
    if (!p || p.is_demo || isWholeLet(p.property_type, r.name)) continue
    const a = areaFor(p.lat == null ? null : Number(p.lat), p.lng == null ? null : Number(p.lng)) ?? AREAS.find(x => x.districts.includes(String(p.postcode ?? '').trim().split(' ')[0].toUpperCase())) ?? null
    if (a) (out[a.slug] ??= []).push(Number(r.current_asking_rent))
  }
  return Object.fromEntries(Object.entries(out).filter(([, v]) => v.length >= 3).map(([k, v]) => [k, { from: Math.min(...v), to: Math.max(...v), count: v.length }]))
}
