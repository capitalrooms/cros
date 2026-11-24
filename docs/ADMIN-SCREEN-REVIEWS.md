# Admin screen reviews — busy screens (24 Nov 2026)

Reviewed in the browser (signed in, read-only) unless marked "earlier". Each note says what's busy, what's unclear and what to change. **No changes made yet** — these are for your review before anything is built.

## Dashboard (`/admin`) — reviewed
- **Busy:** void league table with no heading; the full certificate grid (now replaced with a summary and link — done).
- **Unclear:** "£0 received / £0 due" for November reads as nothing collected rather than "statements only".
- **Check:** the deposits tile (42 protected / 9 not protected / 1 prescribed info served) doesn't add up in an obvious way — needs checking before anyone relies on it.
- **Stale:** a tenancy ending on 1 November is still counted as ending.
- **Change:** one heading for the void table; the rent tile says which mode it's in; fix the deposit tile's labels.

## Maintenance (`/admin/maintenance`) — reviewed
- **Works:** jobs grouped by stage (new, approved, with contractor, in progress, finished).
- **Fixed:** demo job (12 Saltwell Street) no longer in the live list.
- **Unclear:** an emergency job for 15 November is past its date with no job sheet, and nothing stops it sitting there.
- **Busy:** the week calendar takes a lot of space for what it shows (mostly "no jobs booked").
- **Not yet reviewed:** job detail and batch booking.
- **Change:** flag jobs past their booked date at the top; collapse the calendar to a strip.

## Statements (`/admin/statements`) — reviewed
- **Busy:** five tab rows above the page, then three action cards, an annual-statement control, and a statement-emails block before the grid.
- **Worst:** the grid. Each month cell carries four figures (paid, rent, fees, expenses), and two statements can sit in one cell. Too small to read at a glance.
- **Change:** one figure per cell (paid), with rent, fees and expenses in the statement itself. One status per cell (in / to upload / to prepare). Move the annual statement control into the Reports tab. Keep the "3 statements to upload" callout — it's useful.

## Contacts / tenants (`/admin/people?tab=tenants`) — reviewed
- **Busy:** each tenant row has about six controls (App, Email, Text, "Phone not set up", "See their app →", and the menu). Every house group repeats "Messages off — turn on". The sign-in banner and tenant-messages toggles sit above the list.
- **Duplicated:** "No login" and "Phone not set up" repeat on nearly every row.
- **Change:** one sign-in status chip per row; move the App/Email/Text switches into the person's profile (or a single per-house setting); show "no phone" only when the phone is missing.

## Client money (`/admin/client-money`) — reviewed
- **Busy:** six analysis rows, all £0 while we're statements-only (rent awaiting statement, landlord payments due, rent in advance, floats, DPS, suspense). Three cards below the table, with the table itself empty.
- **Works:** the cash-book balance and the agrees-with-bank line are clear.
- **Change:** show only non-zero rows, with one line "nothing else held" when all are zero; put the reconciliation and month close into one card with its state.

## Diary (`/admin/agency-diary`) — reviewed
- **Works:** week grid and day list are readable.
- **Busy:** the header has both "+ Book" and "1 repair to book" as competing actions.
- **Inconsistent:** the banner says 1 repair to book, while the repairs count shows 0.
- **Change:** one primary action; make the banner's count match the filters.

## Planner (`/admin/planner`) — reviewed
- **Busy:** three tab rows (my boards, shared, house improvements), six boards in the sidebar, and each board shows five counters, then long item lists with status, assignee and date columns.
- **Stale:** many items from 2024 and September still open.
- **Change:** show open items only by default, with "show done" as a toggle; keep one counter line per board.

## Rent roll (`/admin/rent-roll`) — reviewed
- **Busy:** three large figures, four filter pills, export buttons, then a narrow table squeezed beside a detail panel. The table columns are cut off on a laptop screen.
- **Unnecessary:** "Adjust account…" on every room while we're statements-only.
- **Change:** widen the table, or move the detail into a drawer; remove "Adjust account…" in statements-only; make "not shown yet" the most visible column.

## Finance home (`/admin/finance`) — earlier
- **Busy:** the "Show 1 / Show 3 / Show 13" dropdowns are unlabelled, and there are five summary tiles plus a list of actions.
- **Change:** label each dropdown with what it shows; keep one list of next actions.

## Applicants (`/admin/applicants`) — earlier
- **Busy:** each row has many actions inside "More"; archive and fall-through were crowded. Archive is now a clear panel; the fall-through link is in place.
- **Change:** keep the row to status, next step and one primary action.

## Lettings file (`/admin/lettings/[id]`) — earlier
- **Busy:** the landlord-updates panel and activity repeat on every tab; the Money tab shows the deposit as "Not yet" with no link to fix it.
- **Change:** show the landlord-updates and activity panels once, on the Progress tab; link the deposit's "Not yet" to the Deposits action.

## Move-in pack (`/admin/move-in/[id]`) — earlier
- **Busy:** one long page: figures, a 31-button payment-day grid, deposit options, agreement choice, 15 documents, email form and Adobe Sign, with no summary of what's left.
- **Change:** a short "what's left" summary at the top; group the documents; put the email form behind a button.

## Tenancies (`/admin/tenancies`) and Applicants list — earlier
- **Works:** clear tabs (current, on notice, moving in, ended) and the stage column.
- **Check:** Rolly still shows as live until the fall-through is done.

---

## Cross-screen changes (suggested order)
1. One primary action per screen; secondary actions in a menu.
2. Show zero or "not applicable" rows only when they matter; hide the rest behind a toggle.
3. Repeated panels (landlord updates, activity, messages toggles) appear once, in the place they're used.
4. Tables show one figure per cell; detail goes in a drawer or the record itself.
5. Done and past items hidden by default, with a "show" toggle.

---

## Fix status (24 Nov 2026)

| Screen | Fix | Status |
|---|---|---|
| Dashboard | Void tile has a heading; certificate grid replaced by a summary | Done |
| Statements grid | One figure per cell (Paid); rent, fees and expenses in the hover text | Done — checked in the browser |
| Client money | Only lines with money are shown; "Nothing else held" when all are zero | Done — checked in the browser |
| Rent roll | "Adjust account…" hidden while statements-only | Done (type check unchanged; not yet checked in the browser) |
| Maintenance | Demo jobs excluded | Done |
| Contacts | "Phone set up" shown only when true (grey "not set up" removed) | Partly done — the App/Email/Text switches still sit on each row; moving them needs your go-ahead |
| Diary | Repairs count label and header actions | **Not started** — the count is built in a component I haven't traced |
| Planner | Done items hidden by default | Done — already shown as a count ("✓ 4 completed") |
| Lettings file | Landlord-updates and activity shown once | **Not started** |
| Move-in pack | "What's left" summary at the top; document groups | **Not started** |
| Finance home | Buttons name their list ("Show the 13 listed") | Done (type check unchanged; not yet checked in the browser) |
| Applicants | One primary action per row | **Not started** |
| Tenancies | Rolly shows live until the fall-through is done | Waiting on you |

The rent roll change hasn't been checked in the browser yet. Nothing has been run against the live database.
