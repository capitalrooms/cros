// The website's fixed content (9 Nov 2026): the words and fees from the old capitalrooms.co.uk, kept exact.
// PHOTOS: drop a path in (a file under public/website/photos/) and that slot shows the photo; blank = a forest panel.
export const PHOTOS: Record<string, string> = {
  hero: '', landlords: '', tenants: '', valuation: '', keys: '', rooftops: '', about: '', maintenance: '',
}

export const NAV: [string, string][] = [
  ['About', '/about-us'], ['Advice', '/blogs'], ['Contact', '/contact'], ['Homes to rent', '/residential-lettings'], ['Landlords', '/landlords'], ['Maintenance', '/maintenance-services'], ['Tenants', '/tenants'],
]

export const OFFICE = { address: 'Hoxton Mix, 66 Paul Street, London EC2A 4NA', phone: '0207 112 9163', phoneHref: 'tel:+442071129163', email: 'info@capitalrooms.co.uk' }
export const APP_LOGIN = 'https://cros-sigma.vercel.app/login'

export const TIERS = [
  { name: 'Let only', fee: '5%', lead: 'Our basic service. We find the tenant and set everything up — you take it from there.', tone: '', items: ['Professional property photography', 'Multi-platform property marketing', 'Tenant referencing', 'New tenancy documentation', 'Registering the deposit'] },
  { name: 'Single let management', fee: '8%', lead: 'Our comprehensive service for a house or flat let to one household.', tone: 'dark', items: ['Professional photography', 'Tenant sourcing and referencing', 'New tenancy documentation', 'Quarterly inspections', 'Monthly statements', '24/7 maintenance and repairs', 'Property licences and health & safety certificates organised'] },
  { name: 'HMO management', fee: '12%', lead: 'Our comprehensive service for shared houses, run room by room.', tone: 'soft', items: ['Professional photography', 'Tenant sourcing and referencing', 'New tenancy documentation', 'Quarterly inspections', 'Monthly statements', '24/7 maintenance and repairs', 'Property licences and health & safety certificates organised'] },
]
export const RENT_GUARANTEE = ['A guaranteed amount paid to you every month', 'No lettings fees', 'Tenant procurement and tenant vacation', 'HMO licensing', 'Weekly cleaning', 'No standard admin fees', 'All relevant health & safety certificates maintained', 'Utility bills arranged if requested']

export const STEPS = [
  { title: 'A valuation you can trust', body: 'We tell you what your property should let for today, and what would help it let faster.' },
  { title: 'Marketed properly', body: 'Professional photography and a clear advert across the major platforms.' },
  { title: 'The right tenant', body: 'Viewings, referencing and the tenancy paperwork, done carefully and on time.' },
  { title: 'Move-in, sorted', body: 'Agreement signed, deposit registered, keys handed over.' },
  { title: 'Looked after, every year', body: 'Inspections, repairs, certificates and monthly statements — with no mark-up on contractors’ invoices.' },
]

export const TENANT_BENEFITS = ['All inclusive rent', 'Fastest wifi possible', 'A fully furnished modern bedroom', 'Complimentary cleaning service', '24hr maintenance assistance', 'Spacious living areas', 'Earn money with our refer a friend scheme', 'Avoiding hefty rent increases', 'Reduced local gym memberships', 'Deals at local restaurants']
export const TENANT_STEPS = [
  { title: 'Reserving a room', body: 'So you have seen a few rooms and have now finalised which room you would like to take. Once you have contacted us we can then send you our reservation email for you to reserve the room. This will ensure the room is reserved for you and then this will be deducted from your final invoice containing the one month deposit and initial rent.' },
  { title: 'Once reserved', body: 'Once you have secured your room you will then receive an email from the referencing company Homeppl who obtain a reference for your income, your previous rental history and credit history. This is a simple process carried out online via their website.' },
  { title: 'Final steps', body: 'Once you have passed the referencing process and are ready to move into your new room, the final steps are to sign your tenancy agreement and pay your final balance. To make things easier for you the tenancy agreement can now be signed online.' },
]
