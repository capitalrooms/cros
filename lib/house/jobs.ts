// The shared house jobs anyone in the house can tick off (21 Nov 2026). Kept in code so the list is easy to change.
export const HOUSE_JOBS: { key: string; label: string }[] = [
  { key: 'bins-out', label: 'Empty the bins' },
  { key: 'recycling', label: 'Take out the recycling' },
  { key: 'bleach-toilet', label: 'Bleach the toilet' },
  { key: 'clean-bathroom', label: 'Clean the bathroom sink and mirror' },
  { key: 'wipe-kitchen', label: 'Wipe the kitchen surfaces' },
  { key: 'clean-fridge', label: 'Clean out the fridge' },
  { key: 'hoover', label: 'Hoover the shared rooms' },
  { key: 'front-entrance', label: 'Clear trash or leaves from the front entrance' },
  { key: 'garden', label: 'Weed or tidy the garden' },
]
export const jobLabel = (key: string) => HOUSE_JOBS.find(j => j.key === key)?.label ?? key
