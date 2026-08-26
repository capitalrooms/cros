/**
 * The tenant icebreaker question set.
 *
 * Light, informal, dating-app-style prompts a tenant answers after signing up
 * and before move-in. Answers are stored as { [question.id]: text } on
 * tenant_icebreakers.answers (JSONB) so this set can grow without a migration.
 *
 * Keep it to 5-6 questions — it must feel disarming, not like a form. Adding a
 * new question here is safe (old rows just won't have that key); NEVER reuse an
 * old id for a different question or existing answers will mislabel.
 */

export interface IcebreakerQuestion {
  id: string
  emoji: string
  /** The prompt as the tenant reads it. */
  prompt: string
  /** Ghost text nudging the kind of answer we're after. */
  placeholder: string
  /** Short label used in compact summaries (housemates grid, admin view). */
  short: string
}

export const ICEBREAKER_QUESTIONS: IcebreakerQuestion[] = [
  {
    id: 'about_me',
    emoji: '👋',
    prompt: 'In a sentence — who are you?',
    placeholder: 'e.g. Nurse, coffee obsessive, always up for a board game night',
    short: 'About them',
  },
  {
    id: 'music',
    emoji: '🎧',
    prompt: "What's on your playlist?",
    placeholder: 'e.g. A bit of everything, but mostly 90s hip-hop and Fleetwood Mac',
    short: 'Music',
  },
  {
    id: 'ideal_sunday',
    emoji: '☀️',
    prompt: 'Your ideal Sunday looks like…',
    placeholder: 'e.g. Long lie-in, roast dinner, and a walk if the weather behaves',
    short: 'Ideal Sunday',
  },
  {
    id: 'around_house',
    emoji: '🏠',
    prompt: "Around the house, I'm more…",
    placeholder: 'e.g. Tidy but relaxed — happy to share a cuppa or keep to myself',
    short: 'Around the house',
  },
  {
    id: 'rhythm',
    emoji: '🌙',
    prompt: 'Early bird or night owl?',
    placeholder: "e.g. Night owl — you'll find me in the kitchen at midnight",
    short: 'Early bird / night owl',
  },
  {
    id: 'fun_fact',
    emoji: '✨',
    prompt: 'One interesting thing about you',
    placeholder: 'e.g. I once cycled from London to Paris for charity',
    short: 'Fun fact',
  },
]

export type IcebreakerAnswers = Record<string, string>

/** How many of the set have a non-empty answer. */
export function answeredCount(answers: IcebreakerAnswers | null | undefined): number {
  if (!answers) return 0
  return ICEBREAKER_QUESTIONS.filter((q) => (answers[q.id] || '').trim().length > 0).length
}

/** True once the tenant has given at least a couple of answers — enough to show. */
export function hasEnoughToShow(answers: IcebreakerAnswers | null | undefined): boolean {
  return answeredCount(answers) >= 2
}
