/**
 * "Say hello to your housemates" — the profile a new tenant fills in (tenant_icebreakers.answers, JSONB keyed by
 * question id, so the set can grow without a migration). NEVER reuse an old id for a different question.
 *
 * 6 Nov 2026 — reworked for the move-in pack (Harry: "the easiest to fill in questions that make people comfortable if
 * they are shy"). What the research on icebreakers for shy people says, and what this follows:
 *   · everything optional, written not spoken, no wrong answers — they choose how much to share
 *   · tap-to-answer first ("this or that", pick a few), a line of text only if they want
 *   · light, specific talking points (a film, an album, a dish) over "describe yourself"
 *   · nothing too personal; a "something people wouldn't guess" for the ones who like to
 * Kinds: 'text' (one line), 'pick' (choose any — stored as "a, b, c", typing your own allowed), 'choice' (one of).
 * The photo is answers.photo (a storage path — lib/housemates/profile) and the avatar answers.avatar (lib/housemates/avatar);
 * neither is a question.
 */

export interface IcebreakerQuestion {
  id: string
  emoji: string
  /** The prompt as the tenant reads it. */
  prompt: string
  /** Ghost text nudging the kind of answer we're after. */
  placeholder: string
  /** Short label used in compact summaries (housemates grid, admin view, emails). */
  short: string
  kind?: 'text' | 'pick' | 'choice'
  options?: string[]
}

export const ICEBREAKER_QUESTIONS: IcebreakerQuestion[] = [
  // 9 Nov 2026: a short bio first, in their own words (shown under their name)
  { id: 'bio', emoji: '💬', short: 'Bio', kind: 'text',
    prompt: 'Your bio: a line or two about you', placeholder: 'e.g. Just moved from Bristol for a new job. Always up for a Sunday roast.' },
  { id: 'about_me', emoji: '👋', short: 'About them', kind: 'text',
    prompt: 'What do you do, in a few words?', placeholder: 'e.g. Nurse at the Royal London, or studying architecture at UCL' },
  { id: 'from', emoji: '📍', short: 'From', kind: 'text',
    prompt: 'Where are you from?', placeholder: 'e.g. Manchester, or Lisbon by way of Leeds' },
  { id: 'weekends', emoji: '☀️', short: 'Weekends', kind: 'pick',
    prompt: 'At the weekend you’ll usually find me…',
    placeholder: 'Or add your own',
    options: ['Cooking', 'At the gym', 'Running', 'Football', 'Walking & parks', 'Gaming', 'Films & series', 'Reading', 'Live music', 'Art & galleries', 'Brunch', 'Out with friends', 'Travelling', 'Recharging at home'] },
  { id: 'film', emoji: '🎬', short: 'Favourite film or series', kind: 'text',
    prompt: 'A film or series you’d recommend', placeholder: 'e.g. Paddington 2 — no notes' },
  { id: 'music', emoji: '🎧', short: 'Music', kind: 'text',
    prompt: 'An album or artist on repeat', placeholder: 'e.g. Rumours by Fleetwood Mac' },
  { id: 'food', emoji: '🍜', short: 'Go-to food', kind: 'text',
    prompt: 'Your go-to meal to cook (or order)', placeholder: 'e.g. A very serious Sunday roast' },
  { id: 'rhythm', emoji: '🌙', short: 'Early bird / night owl', kind: 'choice',
    prompt: 'Early bird or night owl?', placeholder: '', options: ['Early bird', 'Somewhere in between', 'Night owl'] },
  { id: 'house_vibe', emoji: '🏠', short: 'With housemates', kind: 'choice',
    prompt: 'With housemates, I’m usually…', placeholder: '',
    options: ['Up for a chat and the odd film night', 'Friendly but keep to myself', 'Busy — mostly out and about'] },
  { id: 'fun_fact', emoji: '✨', short: 'Something you wouldn’t guess', kind: 'text',
    prompt: 'Something people wouldn’t guess about you', placeholder: 'e.g. I can solve a Rubik’s cube in under a minute' },
]

/** Questions from the first set (Aug 2026) — still shown if someone answered them, never asked again. */
export const OLD_QUESTIONS: IcebreakerQuestion[] = [
  { id: 'ideal_sunday', emoji: '☀️', short: 'Ideal Sunday', prompt: 'Your ideal Sunday looks like…', placeholder: '' },
  { id: 'around_house', emoji: '🏠', short: 'Around the house', prompt: 'Around the house, I’m more…', placeholder: '' },
]
export const ALL_QUESTIONS = [...ICEBREAKER_QUESTIONS, ...OLD_QUESTIONS]

export type IcebreakerAnswers = Record<string, string>

/** How many questions have an answer (the photo doesn't count). */
export function answeredCount(answers: IcebreakerAnswers | null | undefined): number {
  if (!answers) return 0
  return ALL_QUESTIONS.filter((q) => String(answers[q.id] ?? '').trim().length > 0).length
}

/** True once the tenant has given at least a couple of answers — enough to show. */
export function hasEnoughToShow(answers: IcebreakerAnswers | null | undefined): boolean {
  return answeredCount(answers) >= 2
}

/** The answered questions in order, for emails and summaries. */
export function answeredList(answers: IcebreakerAnswers | null | undefined): { q: IcebreakerQuestion; a: string }[] {
  if (!answers) return []
  return ALL_QUESTIONS.map(q => ({ q, a: String(answers[q.id] ?? '').trim() })).filter(x => x.a)
}
