// The tenant feedback form (migration 237): each area scored 1–5, with "how could it be better?" for each.
// Tenants skip an area their house doesn't have. Order: the house room by room, then how we look after it.
export const FEEDBACK_AREAS: { key: string; label: string; ask: string }[] = [
  { key: 'your_room', label: 'Your room', ask: 'Warmth, light, furniture, the bed — anything about your own room' },
  { key: 'kitchen', label: 'Kitchen', ask: 'Space, appliances, storage, how clean it is kept' },
  { key: 'bathroom', label: 'Bathroom', ask: 'Showers, hot water, ventilation, cleanliness' },
  { key: 'living', label: 'Living room', ask: 'Somewhere to relax together' },
  { key: 'hallway', label: 'Hallway & stairs', ask: 'Lighting, tidiness, fire doors' },
  { key: 'outside', label: 'Outside & bins', ask: 'Garden, bins, bikes, the front of the house' },
  { key: 'cleaning', label: 'Cleaning', ask: 'Our cleaner’s visits to the shared areas' },
  { key: 'repairs', label: 'Repairs', ask: 'How quickly and well we fix things' },
  { key: 'keeping_in_touch', label: 'Keeping in touch', ask: 'How easy it is to reach us and how well we tell you things' },
]

export const SCORE_WORDS = ['', 'Poor', 'Not great', 'OK', 'Good', 'Great']

export interface FeedbackRow { ratings: Record<string, number>; comments: Record<string, string>; anything_else: string | null; created_at: string }

/** Average score per area across the forms (only forms that scored it), highest first is not implied. */
export function averages(rows: FeedbackRow[]) {
  return FEEDBACK_AREAS.map(a => {
    const scores = rows.map(r => Number(r.ratings?.[a.key])).filter(n => n >= 1 && n <= 5)
    return { ...a, count: scores.length, average: scores.length ? scores.reduce((x, y) => x + y, 0) / scores.length : null }
  })
}
