// "So, what happens now?" — Capital Rooms' guide to the process, from securing the room to moving in
// (Harry's "Our Guide To The Process.pdf", Tenancy Paperwork). One copy, shown on the applicant's reserve and
// review pages and summarised in the holding deposit receipt email, so everyone hears the same thing.

export interface GuideStage { icon: string; title: string; body: string }

export const PROCESS_GUIDE: GuideStage[] = [
  {
    icon: '🔒', title: 'Lock it down!',
    body: 'Ready to snag that perfect pad? Make a one-week holding deposit by bank transfer to secure the room, then let us know (a screenshot of the confirmation helps). We’ll take the room off the market and reserve it for you.',
  },
  {
    icon: '📎', title: 'Referencing',
    body: 'You’ll then get an email to start your referencing online through Homeppl. Got questions along the way? No worries — Homeppl has a handy online chat to help you out.',
  },
  {
    icon: '✍️', title: 'Signing the digital dotted line',
    body: 'Passed the checks? We’ll email you the tenancy pack to review. Let us know once you’ve read through the documents, and you’ll get an email from Adobe Sign to sign — easy peasy. Once it’s done, we both receive the signed copies by email.',
  },
  {
    icon: '🔑', title: 'Getting the keys!',
    body: 'It’s move-in day, woohoo! Meet us at the property for the grand tour and key handover. We’ll note down any existing damage before we meet you.',
  },
]

export const PROCESS_GUIDE_SIGNOFF = 'We’re here to make your move smooth and stress-free. Have any questions or need a pep talk? Reach out anytime!'

/** Plain-text version for emails. */
export const processGuideText = (from = 1) =>
  PROCESS_GUIDE.slice(from).map(s => `${s.icon} ${s.title}\n${s.body}`).join('\n\n')
