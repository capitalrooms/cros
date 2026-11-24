# Planned Works — inspection and proposal (24 Nov 2026)

Read-only inspection of the current maintenance, contractor and tenant code, then a proposal. **Nothing built.** Harry to approve before any build (Workstream F in ADMIN-AUDIT-PROGRAMME.md).

## What exists today

- **One job table:** `maintenance_tickets`. Status is free text (`reported`, `approved`, `assigned`, `in_progress`, `completed`, `cancelled`…). Extra columns added over time: booked_date/slot, return_needed/return_date, on_hold/hold_reason, reopen fields, cost/final_price, completion_notes, tenant_access_any_time.
- **Timeline:** `ticket_messages` (author, text, time) and the free-text `notes` field on the ticket. Tenant notes and the new update request both append to `notes`.
- **Photos:** `attachments` (ticket_id, storage path). Contractor before/after photo fields exist (`photo_before_url`, `photo_after_url`).
- **Contractor job page** (`app/contractor/job/[jobId]/page.tsx`, ~1,400 lines): book a slot, mark arrived, add before photo (→ `in_progress`), complete (→ `completed`, one step, with price), or log a return visit (→ `assigned` with a new date, or `in_progress`). Also has a task checklist.
- **Tenant job page** (`app/tenant/visit/[ticketId]/page.tsx`): visit details, access approval, add note/photo, ask for an update (added 24 Nov), add-on request.
- **Notifications:** in-app plus push to office and contractor (`lib/serverNotify`, `lib/serverPush`).
- **Chase:** staff-only, for assigned jobs not booked after two days or past their booked day (`app/api/admin/jobs/chase`).

## Gaps against Harry's Planned Works design

1. **No multi-day concept.** A job is booked for one slot. Duration (working days), start date and expected completion don't exist. The return-visit fields are the nearest thing, and they only cover one return.
2. **Completion is one step.** Any submit of the completion form sets `completed`. Harry's safeguard ("a daily update can never complete the whole project") is not a rule yet, but it is the default risk if daily updates reuse the same form.
3. **No facility status.** Nothing tracks sink / shower / kitchen separately from project progress.
4. **No structured daily update.** Notes are free text. There is no fixed message list, no "work completed today", no "return date" field as a log entry.
5. **Tenant view is one job at a time.** No "Property works" list across a house, no full history view, no active-works panel for admin.
6. **Admin dashboard** shows maintenance by status only. Nothing shows active projects across properties.

## Proposed integration (extend, don't duplicate)

**Data (one migration, needs approval):**
- `maintenance_tickets`: add `job_type` (`standard` | `planned`), `planned_duration_days`, `planned_start_on`, `expected_complete_on`, `project_status` (`planned`, `in_progress`, `paused`, `delayed`, `completed`). Keep `status` as today so the chase, reports and tenant page keep working; a planned job sets `status` to `in_progress` while `project_status` is not completed.
- New `project_updates`: ticket_id, update_date, kind (fixed message key or `free`), message, facility_changes (jsonb), completed_today text, return_on date, expected_complete_on (optional), delay flag, created_by, created_at. Append-only (no delete trigger, same rule as other money/trail tables).
- New `project_facilities`: ticket_id, name (e.g. Sink, Shower), facility_status (`available` | `restricted` | `unavailable` | `partial` | `restored`), updated_at, updated_by. Restoring a facility is staff-only (RLS and API check).
- Photos reuse `attachments`, linked to a project update via a new `update_id` column.

**Contractor app:** on a planned job, the page shows "Today's update" instead of the complete-job button. Pick a standard message (water off, paint drying, work ongoing, area closed, facility restored, delayed), or write one. Add photos, what was done, return date, expected completion, and delay flag. Completion stays a separate step that staff confirm; the contractor can request completion but the project closes only when staff accept it with a final inspection.

**Tenant app:** a "Property works" section on the tenant home page: each live planned job for the house, current restriction banner, expected completion, and the full update history newest first. Notify tenants when a facility status changes (in-app and push; no SMS).

**Admin:** "Active works" panel on the maintenance page: all live planned projects across properties, days elapsed, expected completion, facility restrictions. Projects with no update in the last working day get flagged.

**Safeguards (from Harry's note):** open across weekends and gaps; daily update can't complete; facility restore staff-only; delay updates the expected date only once staff confirm; history stays on the property.

## Decisions for Harry before building

1. Confirm the planned/standard split at raise time (a choice on the raise form, default standard).
2. Which facility names to offer by default (sink, shower, bath, toilet, kitchen, heating, hot water, etc.), and whether staff can add their own.
3. Should a contractor's "request completion" go to the office queue, or stay with the existing completion form?
4. Working days: use the house's existing calendar (weekends only) or add a bank-holiday list.

## Suggested order once approved

1. Migration (job_type, project_updates, project_facilities, attachments.update_id).
2. Contractor daily update form on planned jobs.
3. Tenant "Property works" section and notifications.
4. Admin active-works panel.
5. Walk-through in the browser on a test house before anything is shown to tenants.
