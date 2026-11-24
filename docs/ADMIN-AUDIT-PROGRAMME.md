# CROS admin audit programme — master checklist

Status key: **Done** · **Code done, not yet run on live data** · **Investigated** · **Next** · **Needs Harry** · **Deferred** (reason given)

Rule: genuine financial and tenancy records are not altered to make a screen agree. Establish the true position first.

## Highest risk: investigated (read-only, 24 Nov 2026)

| Ref | Finding | What the database says | Status |
|---|---|---|---|
| A7 | Holding deposits: 7 vs 8 | 7 rows are `held`, totalling £1,423.82. The dashboard and client money match. The earlier count of 8 came from stale data. | **Done — no change needed** |
| A2 | Lucy's prescribed information | `prescribed_info_served_at` is empty and the deposit (DEP000069, £995) has not been received. The record is correct. But the move-in pack sent the DPS form on 23 Nov, before the deposit was in. | Investigated — pack fix is item C3 |
| A3 | Duplicate Homeppl documents on Lucy's file | 13 rows, 9 distinct files. Four rows are duplicates pointing at the same stored file (live photo, UK passport, driving licence, one tenancy agreement). Probable cause: webhook and catch-up runs overlapping. | Investigated — **Needs Harry**: approve removing the duplicate rows (see B6) |
| A1 | Rolly's fall-through | Tenancy still live (no cancel). Applicant is "converted". Deposit DEP000063 £923.07 is `pending`, not received. Holding deposit HOLD000010 £184.61 is `held`. No rent charges. | **Needs Harry**: run the fall-through box (Notice & Rent tab, or the applicant's "Let fell through…" link) and choose keep for the holding deposit |
| A8 | Demo and test records in live lists | Two properties are flagged `is_demo`: 12 Test Street – Workflow Demo, and 12 Saltwell Street. Both appear in cleaning, maintenance, emergencies, diary and messages. No test-account person holds a live tenancy. | Investigated — fix in D-batch (filter with the existing demo helper) |
| A9 | £1 call-out | Emergency response row with `call_out_fee = 1`. The contractor's reply text was about being stuck on the sofa; the fee came from the response form. | **Code done**: fees under £10 or over £500 are refused. Normal limit stays £150 (saved value confirmed). Up to £500 only when the emergency can't be contained until morning. **Needs Harry**: decide whether to correct the £1 record (it's a genuine record, so it is not changed without your say) |

## A — Broken or wrong now

| Ref | Finding | Status |
|---|---|---|
| A1 | Rolly still live | **Needs Harry** (see above) |
| A2 | Prescribed info sent before deposit received | Investigated; fix in C3 |
| A3 | Duplicate documents on Lucy's file | Investigated; B6 for prevention, **Needs Harry** for removal |
| A4 | Right to Rent not ticked from Homeppl | **Code done** (passports now count). Not yet run on Lucy's file. Sync only runs on a Homeppl update or when triggered. |
| A5 | "Let-only" link is a 404 | **Corrected**: it isn't in the navigation. I reached it by typing the address. Only an access-list entry remains, and it's harmless. |
| A6 | Certificates labelled "DUE" when valid | **Next** |
| A7 | Holding deposit count | **Done** (see above) |
| A8 | Demo and test records in live lists | **Partly done**: Maintenance list now excludes demo houses. **Next**: Cleaning houses, Diary, Messages, Landlords list |
| A9 | £1 call-out | **Code done** (validation); record decision **Needs Harry** |
| A10 | Wrong headings (Deposits under "Client money"; Rents due and Arrears both "Rent arrears") | **Done** (Rents due and Tenancy deposits renamed; Arrears keeps "Rent arrears") |
| A11 | Income shows percentage jumps against partial prior-year data | **Done**: percentage shown only against a complete prior year |
| A12 | "Days on market: 0" for rooms free since October | **Next** (check the calculation) |
| A13 | Room 1, Flat 4, 44 Claverton Street: two people on notice, one with no leaving date | **Next** (investigate records, then fix the data with you) |

## B — Automation

| Ref | Item | Status |
|---|---|---|
| B1 | Right to Rent from Homeppl | **Code done** (see A4) |
| B2 | Prescribed information ticks when the system sends it | **Next** (verify whether the tick is doubled first) |
| B3 | Deposit protected ticks from the DPS import | **Next** |
| B4 | Move-in money follows bank import or holding record | **Deferred**: needs the bank-matching design; statements-only now |
| B5 | Agreement signed follows Adobe Sign | **Deferred**: needs the signing integration |
| B6 | Duplicate Homeppl documents skipped on import | **Next**: add a per-tenancy check on the stored file name and a database constraint (migration, needs approval) |
| B7 | High-confidence invoices file themselves | **Deferred**: needs your rule for "high confidence" and which houses |

## C — Move-in pack and applicant flow

| Ref | Item | Status |
|---|---|---|
| C1 | Move-in pack is one long page with no "what's left" summary | **Next** |
| C2 | Option labelled "Nigel let-only" reads as a person's name | **Done** (now "Let only (landlord collects rent)") |
| C3 | Pack includes the DPS form before the deposit is received | **Done**: the form is in the pack only once the deposit is recorded as received. Otherwise it's sent from the Deposits screen. |
| C4 | Money tab shows deposit "Not yet" with no link to fix it | **Next** |
| C5 | Landlord-updates panel and activity repeat on every letting-file tab | **Next** |
| C6 | Applicant "More" section crowded; archive and fall-through buried | **Partly done** (archive panel and fall-through link added); tidy the rest |

## D — Too much on screen

| Ref | Item | Status |
|---|---|---|
| D1 | Dashboard void league table has no heading; certificate grid | Certificate grid **Done** (summary + link); void heading **Next** |
| D2 | Contacts: four controls and "Phone not set up" on every row | **Next** |
| D3 | Statements grid: three figures per cell, two statements in a cell | **Next** |
| D4 | Client money: £0 analysis rows while statements-only | **Next** |
| D5 | Bank calendar: 24 "not imported" days while statements-only | **Next** |
| D6 | Publish: Resend setup instructions on the working screen | **Next** (move to settings) |
| D7 | Finance home: "Show 1 / 3 / 13" dropdowns unlabelled | **Next** |
| D8 | Appointments and Agency diary are almost the same screen | **Next** (merge) |
| D9 | Planner: September items still "In progress" | **Next** (needs your decision on each item) |

## E — Consistency

| Ref | Item | Status |
|---|---|---|
| E1 | Reports and Tenant Guides not alphabetical | **Done** |
| E2 | Redirects: Properties → Active rooms; Notifications → Contacts; Accounts → Finance | **Next** (low) |

## Other things found during the audit

- Lucy's tenancy has no rows in `tenancy_events`, but the activity panel shows events. Check which store the activity panel reads from.
- The VAT number is still blank on the VAT page (date and quarters are set).
- The `.audit` folder (local test logins, gitignored) was deleted by mistake during this work. It can be recreated if the audit scripts need them again.

## Changes made in this programme so far

1. Dashboard: certificate grid replaced by a summary and link.
2. Applicants: "Let fell through…" link added; archive control rebuilt as a clear panel.
3. Homeppl sync: Right to Rent ticks from an approved check with a passport or Right to Rent document.
4. Move route: refuses carry-over; writes the deposit trail (migration 303, run).
5. Emergency fee: refused if under £10 or over £2,000.
6. Headings: Rents due and Tenancy deposits renamed.
7. Move-in pack: "Nigel let-only" option renamed.
8. Maintenance list: demo and practice houses excluded.
10. Move-in pack: DPS form only once the deposit is received.
11. Income: year-on-year percentage only against a full prior year.
12. Reports and Tenant Guides sorted alphabetically.
9. Emergency call-out: £500 maximum; £500 applies only when the emergency can't be contained until morning (normal limit £150).

Type check: 1,361 errors before and after; none in the files changed.

## Awaiting-bank receipts (24 Nov 2026)

- **Rent (done in code, not yet tested on live data):** a payment recorded by hand is marked "awaiting bank" in the audit log. When the bank line arrives, the import links it to that payment ("Already recorded") instead of treating it as a duplicate. The amounts are not changed, and the link is recorded as a `bank_confirmed` audit entry. A second identical line is still held as a possible duplicate.
- **Not covered yet:** receipts recorded through other routes (for example the rent-resolve screen) don't carry the flag, so they keep the old behaviour. Deposits and move-in money aren't matched to bank lines at all yet. The reconciliation doesn't show a count of items awaiting the bank.
- **Test before relying on it:** record a payment by hand, import the matching bank line, and confirm it links rather than appearing as a duplicate.

## Finance gap build (started 24 Nov 2026, from the 10ninety comparison)

1. **Fee invoices with payments and overdue tracking.** Part done: migration 305 (`fee_invoices`, `fee_invoice_payments`; no delete; INV numbers; staff only) written, not yet run. Calculations in `lib/invoices/feeInvoice.ts`, tests pass. **Not yet:** API routes, the list of overdue invoices, recording a payment and voiding, and the link from the existing landlord invoice PDF.
2. Receipts split across charges, with a receiving-account field — not started.
3. Tenant bank details for refunds — not started.
4. Standing view of fees waiting to move to the office account, and of rent held per landlord (a presentation change, not an alert) — not started. Today these appear only inside the payment run and the client money analysis.
5. Line-by-line reconciliation — not started.
6. NRL and HMRC T19 reports — not started; only if overseas landlords or T19 are needed.
7. Written retention policy — not started.

