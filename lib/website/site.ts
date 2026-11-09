// The website's fixed content (9 Nov 2026): the words and fees from the old capitalrooms.co.uk, kept exact.
// PHOTOS: drop a path in (a file under public/website/photos/) and that slot shows the photo; blank = a forest panel.
export const PHOTOS: Record<string, string> = {
  // from the old capitalrooms.co.uk (9 Nov 2026). Blank = no photo there (the kitchen came out: not a UK kitchen)
  hero: '/website/photos/thames.jpg', landlords: '/website/photos/terrace.jpg', tenants: '/website/photos/lounge.jpg',
  valuation: '/website/photos/city.jpg', rooftops: '', about: '/website/photos/terrace.jpg', maintenance: '/website/photos/kitchen-shard.jpg', rent: '/website/photos/kitchen-shard.jpg', keys: '',
}

// the usual order on London letting agents' sites (9 Nov 2026, Harry): what people come for first, the company last
export const NAV: [string, string][] = [
  ['To rent', '/residential-lettings'], ['Landlords', '/landlords'], ['Tenants', '/tenants'], ['Maintenance', '/maintenance-services'], ['About us', '/about-us'], ['Advice', '/blogs'], ['Contact', '/contact'],
]

// the team on About us (9 Nov 2026, Harry's words tidied). photo: a file under public/website/team/, blank = initial in a circle
export const TEAM: { name: string; role: string; photo: string; bio: string; quote?: string }[] = [
  { name: 'Harry', role: 'Founder · your one point of contact', photo: '',
    bio: 'Harry set up Capital Rooms in 2018 after working at a large estate agency, where he watched landlords get passed from one desk to the next and never quite know who was looking after their home. Here, you have his number. He answers it, knows your property, and keeps you up to date with the rules as they change.',
    quote: 'Being the person every landlord calls is the busiest part of my job, and the part I’d never give up. Some landlords like a weekly catch-up on Zoom, others prefer to hear from me only when it matters. Either way, you’ll always know what’s happening with your home.' },
  { name: 'Jacob', role: 'Lettings', photo: '',
    bio: 'Jacob has let homes for several London agencies and now runs our lettings, from the first viewing to the day the keys are handed over. Tenants love his warmth, especially people new to the city. Landlords get the other side of him too: careful referencing, honest feedback and the right tenant, not just the first one.' },
  { name: 'Martin', role: 'Accounts', photo: '',
    bio: 'Martin brings 20 years in property finance, including time at the software companies that produce landlord statements. He chases rent the day it’s late so it doesn’t become arrears, and makes sure every payment, invoice and statement leaves a clear paper trail you and your accountant can rely on.' },
  { name: 'Ricky', role: 'Maintenance', photo: '',
    bio: 'Ricky learnt every part of a building at one of London’s biggest construction firms before going it alone. When something needs fixing, he’s who we call: the job is done properly the first time, priced fairly, and you see the photos when it’s finished.' },
]

// our Google rating (Business Profile, checked 9 Nov 2026): update when it moves
export const GOOGLE_RATING = { stars: '4.9', count: 101 }

export const OFFICE = { address: 'Hoxton Mix, 66 Paul Street, London EC2A 4NA', phone: '0207 112 9163', phoneHref: 'tel:+442071129163', email: 'info@capitalrooms.co.uk' }
export const APP_LOGIN = '/login'

export const TIERS = [
  { name: 'Let only', fee: '5% + VAT', lead: 'Our basic service. We find the tenant and set everything up, then you take it from there.', tone: '', items: ['Professional property photography', 'Multi-platform property marketing', 'Tenant referencing', 'New tenancy documentation', 'Registering the deposit'] },
  { name: 'Single let management', fee: '8% + VAT', lead: 'Our comprehensive service for a house or flat let to one household.', tone: 'dark', items: ['Professional photography', 'Tenant sourcing and referencing', 'New tenancy documentation', 'Quarterly inspections', 'Monthly statements', '24/7 maintenance and repairs', 'Property licences and health & safety certificates organised'] },
  { name: 'HMO management', fee: '12% + VAT', lead: 'Our comprehensive service for shared houses, run room by room.', tone: 'soft', items: ['Professional photography', 'Tenant sourcing and referencing', 'New tenancy documentation', 'Quarterly inspections', 'Monthly statements', '24/7 maintenance and repairs', 'Property licences and health & safety certificates organised'] },
]

export const STEPS = [
  { title: 'A valuation you can trust', body: 'We tell you what your property should let for today, and what would help it let faster.' },
  { title: 'Marketed properly', body: 'Professional photography and a clear advert across the major platforms.' },
  { title: 'The right tenant', body: 'Viewings, referencing and the tenancy paperwork, done carefully and on time.' },
  { title: 'Move-in, sorted', body: 'Agreement signed, deposit registered, keys handed over.' },
  { title: 'Looked after, every year', body: 'Inspections, repairs, certificates and monthly statements, with no mark-up on contractors’ invoices.' },
]

export const TENANT_BENEFITS = ['All inclusive rent', 'Fastest wifi possible', 'A fully furnished modern bedroom', 'Complimentary cleaning service', '24hr maintenance assistance', 'Spacious living areas', 'Earn money with our refer a friend scheme', 'Avoiding hefty rent increases', 'Reduced local gym memberships', 'Deals at local restaurants']
export const TENANT_STEPS = [
  { title: 'Reserving a room', body: 'So you have seen a few rooms and have now finalised which room you would like to take. Once you have contacted us we can then send you our reservation email for you to reserve the room. This will ensure the room is reserved for you and then this will be deducted from your final invoice containing the one month deposit and initial rent.' },
  { title: 'Once reserved', body: 'Once you have secured your room you will then receive an email from the referencing company Homeppl who obtain a reference for your income, your previous rental history and credit history. This is a simple process carried out online via their website.' },
  { title: 'Final steps', body: 'Once you have passed the referencing process and are ready to move into your new room, the final steps are to sign your tenancy agreement and pay your final balance. To make things easier for you the tenancy agreement can now be signed online.' },
]
