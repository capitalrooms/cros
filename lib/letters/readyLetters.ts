// Ready-made letters for Letters & Invoices (22 Oct 2026, Harry: "research 10 most common letters or correspondence
// to tenants and have them ready to go … easy to populate and send"). The everyday letters a UK HMO letting agent
// sends: rent (reminder → formal → final, payment plan, thank-you), the end of a tenancy (notice confirmed, move-out,
// deposit), access, house rules, and proof letters tenants ask for (reference, proof of address, rent paid).
//
// {tokens} fill from the tenancy the letter is for; anything in [square brackets] is left for you to fill in on the
// check screen. Body format as the AI drafts it (lib/letters/draftLetter): "- " bullets, **bold**, "## " headings.
// Renters' Rights Act wording: periodic tenancies, two months' notice from the tenant, no fixed terms or renewals.

export type LetterAudience = 'tenant' | 'anyone'
export interface ReadyLetter { id: string; group: string; name: string; audience: LetterAudience; subject: string; body: string; closing: 'Yours sincerely' | 'Yours faithfully' | 'Kind regards' }

export const READY_LETTERS: ReadyLetter[] = [
  // ── rent ──
  { id: 'rent-reminder', group: 'Rent', name: 'Friendly rent reminder', audience: 'tenant', closing: 'Kind regards',
    subject: 'Your rent for {room}, {house}',
    body: `We haven’t yet received your rent of **{rent}**, which was due on [due date]. It may simply have been missed, so this is a friendly reminder.

Please pay as soon as you can, using your payment reference **{payment_ref}** so we can match it straight away. If you’ve paid in the last day or two, thank you — please ignore this letter.

If something has changed and you’re finding it hard to pay, please tell us now. We would much rather agree a plan with you early than let arrears build up.` },
  { id: 'rent-arrears', group: 'Rent', name: 'Rent arrears — formal letter', audience: 'tenant', closing: 'Yours sincerely',
    subject: 'Rent arrears — {room}, {house}',
    body: `Our records show that your rent account is in arrears by **[amount owed]**. A statement of your account is enclosed.

We wrote to you on [date of first reminder] and have not yet received payment or heard from you.

Please either:
- pay the full amount by **[date — 7 days from today]**, using your reference **{payment_ref}**, or
- contact us before that date to agree a repayment plan you can keep to.

If you are struggling financially, free independent advice is available from Citizens Advice (citizensadvice.org.uk) and StepChange (stepchange.org). We will take any plan you agree with them seriously.` },
  { id: 'rent-final', group: 'Rent', name: 'Rent arrears — final letter before action', audience: 'tenant', closing: 'Yours sincerely',
    subject: 'Final notice of rent arrears — {room}, {house}',
    body: `Despite our letters of [dates of earlier letters], your rent account remains in arrears by **[amount owed]**. A statement of your account is enclosed.

Unless the arrears are paid, or you contact us to agree a repayment plan, by **[date — 14 days from today]**, we will advise the landlord on the next steps. These may include serving a notice seeking possession under the Housing Act 1988 on the rent arrears grounds, and recovering the debt through the courts, which would add costs and could affect your credit record.

We do not want to take this step. Please call or email us as soon as you receive this letter — we will listen and try to agree something workable.

Free, independent advice: Citizens Advice (citizensadvice.org.uk), Shelter (shelter.org.uk, 0808 800 4444) and StepChange (stepchange.org).` },
  { id: 'payment-plan', group: 'Rent', name: 'Confirming a repayment plan', audience: 'tenant', closing: 'Kind regards',
    subject: 'Your repayment plan — {room}, {house}',
    body: `Thank you for speaking with us. This letter confirms the plan we agreed to clear the arrears of **[amount owed]** on your rent account.

- Your normal rent of **{rent}** continues to be due as usual.
- On top of that you will pay **[instalment amount]** on [day] each month, starting **[first date]**.
- At that rate the arrears will be cleared by **[final date]**.

Please use your reference **{payment_ref}** for every payment. If you can’t make a payment, tell us before it is due and we will look at it again together.` },
  { id: 'rent-thanks', group: 'Rent', name: 'Thank you for paying on time', audience: 'tenant', closing: 'Kind regards',
    subject: 'Thank you — your rent record at {house}',
    body: `We wanted to say thank you. Your rent has arrived on time every month since [month], and that makes a real difference to how smoothly we can run {house}.

A good rent record is worth having: we are always happy to give a reference to a future landlord, mortgage lender or employer that says so.` },
  { id: 'payment-details', group: 'Rent', name: 'How to pay your rent', audience: 'tenant', closing: 'Kind regards',
    subject: 'How to pay your rent for {room}, {house}',
    body: `Your rent is **{rent}** a month, due on the **{due_day}** of each month, paid monthly in advance.

Please pay by standing order to our client account:
- Account name: [account name]
- Sort code: [sort code]
- Account number: [account number]
- Reference: **{payment_ref}** — please always use this, so we can match your payment straight away

We will never ask you to change these details by email or text. If you ever receive a message asking you to pay somewhere else, please call us first.` },

  // ── moving in and out ──
  { id: 'welcome', group: 'Moving in and out', name: 'Welcome to your new home', audience: 'tenant', closing: 'Kind regards',
    subject: 'Welcome to {house}',
    body: `Welcome to {room} at {house}. We hope you settle in quickly.

A few things to know:
- Your rent is **{rent}** a month, due on the {due_day}, with reference **{payment_ref}**.
- Report repairs in the Capital Rooms app — you can add photos and see when a visit is booked.
- Your tenancy is periodic (rolling). If you decide to move on, you give us two months’ notice in writing, at any time.
- The house guides in the app cover fire safety, keeping mould away and living well with housemates.

If anything isn’t right in your first week, please tell us.` },
  { id: 'notice-confirmed', group: 'Moving in and out', name: 'Confirming your notice to leave', audience: 'tenant', closing: 'Kind regards',
    subject: 'Your notice to leave {room}, {house}',
    body: `Thank you for letting us know you will be moving on. We received your notice on **[date notice received]**, so your tenancy will end on **{end_date}**.

Rent is due up to and including that date. Over the coming weeks:
- we may arrange viewings of your room — we will always give you at least 24 hours’ notice;
- we will send you our move-out guide and book your check-out;
- after you leave we will return your deposit, less any deductions agreed, within the time the deposit scheme requires.

If your plans change, tell us as soon as possible. We are sorry to see you go and wish you well.` },
  { id: 'move-out', group: 'Moving in and out', name: 'Your move-out: what happens next', audience: 'tenant', closing: 'Kind regards',
    subject: 'Moving out of {room} — what happens next',
    body: `Your tenancy ends on **{end_date}**. To make the check-out quick and your deposit return straightforward:

- Leave the room clean and empty, including drawers, under the bed and the fridge and cupboard space you used.
- Take everything with you — anything left behind may be disposed of.
- Return all keys and fobs to [where to return keys] by [time] on your last day.
- Give us a forwarding address and the bank details for your deposit return.

We will check the room against the inventory from when you moved in and write to you about your deposit within [number] days.` },
  { id: 'belongings', group: 'Moving in and out', name: 'Belongings left behind', audience: 'tenant', closing: 'Yours sincerely',
    subject: 'Belongings left at {room}, {house}',
    body: `Following the end of your tenancy on {end_date}, the following items were left in the room:
- [list of items]

This letter is notice under the Torts (Interference with Goods) Act 1977. Please collect the items by **[date — at least 14 days from today]** by contacting us to arrange a time. If they are not collected by then, they will be disposed of, and any reasonable cost of removal and storage may be deducted from your deposit.` },

  // ── deposit ──
  { id: 'deposit-protected', group: 'Deposit', name: 'Your deposit is protected', audience: 'tenant', closing: 'Kind regards',
    subject: 'Your deposit for {room}, {house}',
    body: `Your deposit of **[deposit amount]** is protected with [scheme name], a government-approved tenancy deposit scheme, under reference **[scheme reference]**.

The prescribed information for your deposit is enclosed. It explains how the scheme works, how your deposit will be returned at the end of the tenancy, and what to do if we can’t agree on any deductions — the scheme offers a free dispute service.

Please keep this letter and the enclosed information safe.` },
  { id: 'deposit-return', group: 'Deposit', name: 'Your deposit: proposed deductions', audience: 'tenant', closing: 'Kind regards',
    subject: 'Your deposit return — {room}, {house}',
    body: `Following your check-out on [check-out date], we propose to return your deposit as follows:

- Deposit held: **[deposit amount]**
- Proposed deductions: [each deduction and amount]
- To be returned to you: **[amount to return]**

Photos and the check-out report are enclosed. If you agree, please reply to confirm and we will arrange payment within [number] days. If you don’t agree, tell us why — and if we still can’t agree, you can use [scheme name]’s free dispute service.` },

  // ── access and house rules ──
  { id: 'access', group: 'Access and house rules', name: 'Notice of a visit (24 hours)', audience: 'tenant', closing: 'Kind regards',
    subject: 'Visit to {house} on [date]',
    body: `We would like to visit {house} on **[date]** between **[time window]** to [reason — e.g. carry out a routine inspection / let a contractor in to repair the boiler].

This letter is your written notice of the visit, given at least 24 hours in advance. You don’t need to be in. If the time is difficult for you, please let us know and we will try to find another time.` },
  { id: 'viewings', group: 'Access and house rules', name: 'Viewings while you are on notice', audience: 'tenant', closing: 'Kind regards',
    subject: 'Viewings of {room} before you move out',
    body: `As your tenancy ends on {end_date}, we will start showing {room} to people looking for a home.

We will always give you at least 24 hours’ notice of a viewing, and one of us will be with the visitors the whole time. A tidy room helps a great deal and means fewer viewings. If there are times that are never good for you, let us know and we will avoid them.` },
  { id: 'cleanliness', group: 'Access and house rules', name: 'Keeping the shared areas clean', audience: 'tenant', closing: 'Yours sincerely',
    subject: 'The shared areas at {house}',
    body: `We have received concerns about the condition of the shared areas at {house} — in particular [what has been reported, e.g. dishes left in the sink and rubbish not taken out].

Your tenancy agreement asks every tenant to keep the shared areas clean and tidy and to take their share of the household tasks. Please make sure that, from now on, you clean up straight after using the kitchen and bathroom and take your rubbish out when the bin is full.

We will check the house again on or after [date]. Thank you for your help in keeping {house} a pleasant place to live for everyone.` },
  { id: 'noise', group: 'Access and house rules', name: 'Noise complaints', audience: 'tenant', closing: 'Yours sincerely',
    subject: 'Noise at {house}',
    body: `We have received complaints about noise from {room} at {house}, particularly [when — e.g. late at night on weekdays].

Your tenancy agreement requires you not to cause a nuisance or annoyance to your housemates or neighbours. Please keep noise down, especially between 11pm and 7am, including music, calls and guests.

We would like to resolve this informally. If the complaints continue, we will have to take further action under the tenancy agreement.` },
  { id: 'occupants', group: 'Access and house rules', name: 'Someone else living in your room', audience: 'tenant', closing: 'Yours sincerely',
    subject: 'Occupation of {room}, {house}',
    body: `We understand that [name, if known / another person] has been staying in {room} for [how long].

{room} is let to you alone. The house has a licence for a set number of people, and anyone living there who isn’t on a tenancy isn’t covered by our fire safety arrangements or the house insurance. Occasional overnight guests are fine; someone living in the room is not.

Please confirm by **[date]** that the person has moved out, or contact us if you would like to discuss them applying for a room of their own.` },

  // ── proof letters ──
  { id: 'reference', group: 'References and proof', name: 'Tenant reference', audience: 'anyone', closing: 'Yours faithfully',
    subject: 'Reference for {tenant}',
    body: `We are pleased to confirm that {tenant} has rented {room} at {address} through Capital Rooms since **{start_date}**, at a rent of **{rent}** a month.

During the tenancy:
- rent has been paid [on time / with the following exceptions: …];
- the room and shared areas have been kept [in good order];
- we have [had no complaints / note the following: …].

We would [happily] rent to {tenant} again. Please contact us if you need anything further.` },
  { id: 'proof-of-address', group: 'References and proof', name: 'Confirmation of tenancy (proof of address)', audience: 'anyone', closing: 'Yours faithfully',
    subject: 'Confirmation of tenancy — {tenant}',
    body: `We confirm that {tenant} is a tenant of Capital Rooms and lives at:

**{room}, {address}**

The tenancy began on **{start_date}** and is a periodic (rolling) assured tenancy. The rent is **{rent}** a month.

This letter is provided at the tenant’s request.` },
  { id: 'rent-paid', group: 'References and proof', name: 'Confirmation of rent paid', audience: 'anyone', closing: 'Yours faithfully',
    subject: 'Rent paid by {tenant}',
    body: `We confirm that {tenant}, of {room}, {address}, pays rent of **{rent}** a month to Capital Rooms.

Between **[from date]** and **[to date]** they paid **[total paid]** in rent, and their rent account [is up to date / shows a balance of …]. A statement of account is enclosed.

This letter is provided at the tenant’s request.` },
]

export interface LetterFacts { tenant?: string; room?: string; house?: string; address?: string; rent?: string; payment_ref?: string; start_date?: string; end_date?: string; due_day?: string }

/** Put the tenancy's facts in; any fact we don't have becomes a [placeholder] to fill in on the check screen. */
export function fillLetter(text: string, f: LetterFacts): string {
  const blanks: Record<string, string> = { tenant: '[tenant name]', room: '[room]', house: '[house]', address: '[address]', rent: '[monthly rent]', payment_ref: '[payment reference]', start_date: '[tenancy start date]', end_date: '[tenancy end date]', due_day: '[rent due day]' }
  return text.replace(/\{([a-z_]+)\}/g, (m, k: string) => (f as Record<string, string | undefined>)[k] || blanks[k] || m)
}
