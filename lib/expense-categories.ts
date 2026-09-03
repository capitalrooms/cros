// Shared expense category definitions used by AI categorisation,
// admin review UI, and the landlord breakdown view.

export interface ExpenseCategory {
  slug: string
  label: string
  type: 'property_wide' | 'room_specific' | 'unmatched' | 'income'
  keywords: string[]   // hints for the AI prompt; not used for matching
  emoji: string
}

// Income categories — shown separately from expense categories
export const INCOME_CATEGORIES: ExpenseCategory[] = [
  {
    slug: 'rent_income',
    label: 'Rent Income',
    type: 'income',
    emoji: '💷',
    keywords: ['rent', 'rent received', 'rental income', 'room rent', 'monthly rent'],
  },
]

export const PROPERTY_WIDE_CATEGORIES: ExpenseCategory[] = [
  {
    slug: 'roof_exterior',
    label: 'Roof & Exterior',
    type: 'property_wide',
    emoji: '🏠',
    keywords: ['roof', 'gutter', 'render', 'pointing', 'fascia', 'soffit', 'exterior', 'damp proof'],
  },
  {
    slug: 'boiler_heating',
    label: 'Boiler & Heating',
    type: 'property_wide',
    emoji: '🔥',
    keywords: ['boiler', 'heating', 'radiator', 'thermostat', 'gas', 'hot water', 'cylinder', 'valve'],
  },
  {
    slug: 'plumbing',
    label: 'Plumbing',
    type: 'property_wide',
    emoji: '🚿',
    keywords: ['plumbing', 'pipe', 'drain', 'leak', 'tap', 'toilet', 'basin', 'shower', 'bath', 'water'],
  },
  {
    slug: 'electrical',
    label: 'Electrical',
    type: 'property_wide',
    emoji: '⚡',
    keywords: ['electric', 'wiring', 'fuse', 'circuit', 'socket', 'switch', 'light', 'eicr'],
  },
  {
    slug: 'cleaning',
    label: 'Professional Cleaning',
    type: 'property_wide',
    emoji: '🧹',
    keywords: ['clean', 'deep clean', 'end of tenancy', 'oven clean', 'carpet clean'],
  },
  {
    slug: 'broadband',
    label: 'Internet & Broadband',
    type: 'property_wide',
    emoji: '📶',
    keywords: ['broadband', 'internet', 'wifi', 'router', 'bt', 'virgin', 'sky', 'hyperoptic'],
  },
  {
    slug: 'fire_safety',
    label: 'Fire Safety',
    type: 'property_wide',
    emoji: '🔥',
    keywords: ['fire door', 'fire alarm', 'smoke alarm', 'heat detector', 'co alarm', 'extinguisher', 'fire safety', 'fire risk'],
  },
  {
    slug: 'insurance',
    label: 'Insurance',
    type: 'property_wide',
    emoji: '🛡️',
    keywords: ['insurance', 'premium', 'policy', 'buildings insurance', 'landlord insurance'],
  },
  {
    slug: 'communal_areas',
    label: 'Communal Areas',
    type: 'property_wide',
    emoji: '🚪',
    keywords: ['communal', 'hallway', 'landing', 'stairs', 'entrance', 'lobby', 'common area'],
  },
  {
    slug: 'communal_kitchen',
    label: 'Communal Kitchen',
    type: 'property_wide',
    emoji: '🍳',
    keywords: ['kitchen', 'cooker', 'hob', 'oven', 'fridge', 'microwave', 'dishwasher', 'washing machine', 'extractor'],
  },
  {
    slug: 'garden_outdoor',
    label: 'Garden & Outdoor',
    type: 'property_wide',
    emoji: '🌿',
    keywords: ['garden', 'lawn', 'hedge', 'fence', 'gate', 'bin', 'patio', 'outdoor'],
  },
  {
    slug: 'pest_control',
    label: 'Pest Control',
    type: 'property_wide',
    emoji: '🐛',
    keywords: ['pest', 'rodent', 'mice', 'rat', 'cockroach', 'bug', 'insect', 'infestation'],
  },
  {
    slug: 'decorating',
    label: 'Painting & Decorating',
    type: 'property_wide',
    emoji: '🎨',
    keywords: ['paint', 'decor', 'wallpaper', 'plastering', 'skim', 'filling', 'sanding'],
  },
  {
    slug: 'security',
    label: 'Locks & Security',
    type: 'property_wide',
    emoji: '🔒',
    keywords: ['lock', 'key', 'key safe', 'door entry', 'intercom', 'cctv', 'alarm', 'security'],
  },
  {
    slug: 'appliances_property',
    label: 'Appliances (Property-Wide)',
    type: 'property_wide',
    emoji: '🔧',
    keywords: ['appliance', 'white goods', 'tumble dryer', 'fridge freezer'],
  },
  {
    slug: 'compliance_certs',
    label: 'Compliance & Certificates',
    type: 'property_wide',
    emoji: '📋',
    keywords: ['gas safety', 'epc', 'electrical certificate', 'hmo licence', 'pat test', 'legionella', 'asbestos', 'certificate', 'inspection'],
  },
  {
    slug: 'management_fee',
    label: 'Management Fee',
    type: 'property_wide',
    emoji: '💼',
    keywords: ['management fee', 'management charge', 'agency fee', 'capital rooms fee', 'letting management', 'management (10%)', 'management (12%)'],
  },
  {
    slug: 'letting_fee',
    label: 'Letting Fee',
    type: 'property_wide',
    emoji: '🏠',
    keywords: ['letting fee', 'tenant find', 'new tenant fee', 'reletting fee', 'tenant introduction', 'find tenant'],
  },
  {
    slug: 'maintenance_repair',
    label: 'Maintenance & Repairs',
    type: 'property_wide',
    emoji: '🔧',
    keywords: ['maintenance', 'repair', 'handyman', 'works carried out', 'property works', 'general maintenance'],
  },
  {
    slug: 'legal_professional',
    label: 'Legal & Professional Fees',
    type: 'property_wide',
    emoji: '⚖️',
    keywords: ['solicitor', 'legal', 'professional fee', 'survey', 'valuation', 'accountant'],
  },
  {
    slug: 'tv_licensing',
    label: 'TV Licensing',
    type: 'property_wide',
    emoji: '📺',
    keywords: ['tv licence', 'tv licensing', 'television licence', 'bbc'],
  },
  {
    slug: 'furniture_property',
    label: 'Furniture',
    type: 'property_wide',
    emoji: '🛋️',
    keywords: ['furniture', 'sofa', 'couch', 'table', 'chair', 'bed', 'mattress', 'desk', 'wardrobe', 'chest of drawers', 'shelving', 'communal furniture', 'remove', 'disposal'],
  },
  {
    slug: 'other_property',
    label: 'Other (Property-Wide)',
    type: 'property_wide',
    emoji: '📦',
    keywords: [],
  },
]

export const ROOM_SPECIFIC_CATEGORY_TYPES = [
  { slug: 'room_furniture',    label: 'Furniture',    keywords: ['furniture', 'bed', 'mattress', 'desk', 'chair', 'wardrobe', 'chest', 'drawers', 'sofa'] },
  { slug: 'room_decorating',   label: 'Decorating',   keywords: ['paint', 'decor', 'wallpaper', 'carpet', 'flooring', 'curtain', 'blind'] },
  { slug: 'room_appliances',   label: 'Appliances',   keywords: ['tv', 'fridge', 'appliance', 'kettle', 'lamp'] },
  { slug: 'room_maintenance',  label: 'Maintenance',  keywords: ['repair', 'fix', 'replace', 'maintenance'] },
  { slug: 'room_other',        label: 'Other',        keywords: [] },
]

// The "not categorised" bucket
export const UNMATCHED_SLUG = 'other'

// All slugs in one flat array (for validation)
export const ALL_CATEGORY_SLUGS = [
  ...INCOME_CATEGORIES.map(c => c.slug),
  ...PROPERTY_WIDE_CATEGORIES.map(c => c.slug),
  ...ROOM_SPECIFIC_CATEGORY_TYPES.map(c => c.slug),
  UNMATCHED_SLUG,
]

// Human-readable label for any slug
export function categoryLabel(slug: string): string {
  const pw = PROPERTY_WIDE_CATEGORIES.find(c => c.slug === slug)
  if (pw) return pw.label
  const rs = ROOM_SPECIFIC_CATEGORY_TYPES.find(c => c.slug === slug)
  if (rs) return rs.label
  return 'Other / Not Matched'
}

export function categoryEmoji(slug: string): string {
  const pw = PROPERTY_WIDE_CATEGORIES.find(c => c.slug === slug)
  return pw?.emoji ?? '📦'
}
