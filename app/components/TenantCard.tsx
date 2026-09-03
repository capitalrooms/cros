'use client'

/**
 * TenantCard — canonical tenant identity card used on every screen that
 * shows a tenant's profile header.
 *
 * Shows:
 *  - Initials circle OR a small ID photo thumbnail when one is stored
 *  - Name, email, phone, current tenancy summary, rent
 *  - Reference decision badge + RTR badge
 *  - Optional "Send invite" button
 *  - Optional "Accept as ID photo" prompt when a candidate image is supplied
 *    (used during reference import when a passport/ID doc is detected)
 */

import { useState } from 'react'

export interface TenantCardTenant {
  id: string
  name?: string | null
  first_name?: string | null
  last_name?: string | null
  full_name?: string | null
  email: string
  phone?: string | null
  created_at: string
  reference_status?: string | null
  right_to_rent_until?: string | null
  id_photo_url?: string | null       // stored after admin accepts a passport scan
}

export interface TenantCardTenancy {
  room?: { name: string } | null
  property?: { address: string; name?: string } | null
  rent_amount?: number | null
  rent_monthly?: number | null
  start_date?: string | null
  end_date?: string | null
}

interface TenantCardProps {
  tenant: TenantCardTenant
  currentTenancy?: TenantCardTenancy | null

  /** Invite flow */
  onInvite?: () => void
  inviting?: boolean
  inviteMsg?: string | null

  /**
   * Candidate ID photo — a local object URL from an uploaded passport/ID scan.
   * When supplied, shows a prompt asking the admin to accept it.
   * On acceptance, calls onAcceptIdPhoto with the candidate URL so the caller
   * can persist it (upload to storage + save to people.id_photo_url).
   */
  candidateIdPhotoUrl?: string | null
  onAcceptIdPhoto?: (url: string) => void

  /** Whether the accept action is in progress */
  acceptingPhoto?: boolean
}

/* ── Display helpers ── */

export function tenantDisplayName(t: TenantCardTenant | null | undefined): string {
  if (!t) return '—'
  return t.full_name
    || [t.first_name, t.last_name].filter(Boolean).join(' ')
    || t.name
    || t.email
}

function tenantInitials(t: TenantCardTenant): string {
  const n = tenantDisplayName(t)
  return n.split(' ').slice(0, 2).map(w => w[0]?.toUpperCase() ?? '').join('')
}

function fmtDate(d: string | null | undefined) {
  if (!d) return null
  return new Date(d).toLocaleDateString('en-GB', { year: 'numeric', month: 'short', day: 'numeric' })
}

function decisionBadge(d: string | null | undefined) {
  if (!d) return null
  const cls =
    d === 'Approved' ? 'bg-green-100 text-green-800 border-green-200'
  : d === 'Declined' ? 'bg-red-100 text-red-800 border-red-200'
  : 'bg-amber-100 text-amber-800 border-amber-200'
  return (
    <span className={`text-xs font-semibold px-sm py-xs rounded-full border ${cls}`}>{d}</span>
  )
}

function rtrBadge(until: string | null | undefined) {
  if (!until) return null
  const valid = new Date(until) > new Date()
  return (
    <span className={`text-xs font-semibold px-sm py-xs rounded-full border ${valid ? 'bg-green-100 text-green-800 border-green-200' : 'bg-red-100 text-red-800 border-red-200'}`}>
      RTR {valid ? '✓' : 'EXPIRED'} {new Date(until).toLocaleDateString('en-GB', { month: 'short', year: 'numeric' })}
    </span>
  )
}

/* ── Component ── */

export default function TenantCard({
  tenant,
  currentTenancy,
  onInvite,
  inviting,
  inviteMsg,
  candidateIdPhotoUrl,
  onAcceptIdPhoto,
  acceptingPhoto,
}: TenantCardProps) {
  const [dismissed, setDismissed] = useState(false)

  const name  = tenantDisplayName(tenant)
  const rent  = currentTenancy
    ? Number((currentTenancy as any).rent_amount || currentTenancy.rent_monthly || 0) || null
    : null

  const showCandidate = candidateIdPhotoUrl && !dismissed && !tenant.id_photo_url

  return (
    <div className="rounded-2xl border border-neutral-200 bg-white overflow-hidden">

      {/* Colour strip — green active / neutral ex */}
      <div className={`h-1.5 w-full ${currentTenancy && !currentTenancy.end_date ? 'bg-green-500' : 'bg-neutral-200'}`} />

      <div className="px-xl py-xl">

        {/* Invite feedback */}
        {inviteMsg && (
          <div className={`mb-lg rounded-xl px-md py-sm text-sm font-semibold ${inviteMsg.startsWith('✓') ? 'bg-green-50 text-green-800 border border-green-200' : 'bg-red-50 text-red-800 border border-red-200'}`}>
            {inviteMsg}
          </div>
        )}

        <div className="flex items-start gap-xl">

          {/* Avatar — photo if stored, initials otherwise */}
          <div className="relative flex-shrink-0">
            {tenant.id_photo_url ? (
              <img
                src={tenant.id_photo_url}
                alt={name}
                className="w-16 h-16 rounded-full object-cover border border-neutral-200 bg-neutral-100"
              />
            ) : (
              <div className="w-16 h-16 rounded-full bg-blue-50 border border-blue-100 flex items-center justify-center text-blue-700 font-bold text-xl select-none">
                {tenantInitials(tenant)}
              </div>
            )}
          </div>

          {/* Name, badges, actions, facts */}
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-md flex-wrap mb-sm">
              <h2 className="text-2xl font-bold text-neutral-900 leading-tight">{name}</h2>

              <div className="flex items-center gap-sm flex-wrap">
                {decisionBadge(tenant.reference_status)}
                {rtrBadge(tenant.right_to_rent_until)}
                {onInvite && (
                  <button
                    onClick={onInvite}
                    disabled={inviting}
                    className="rounded-lg border border-neutral-200 px-md py-xs text-xs font-semibold text-neutral-600 hover:bg-neutral-50 disabled:opacity-40 transition"
                  >
                    {inviting ? 'Sending…' : '✉ Send invite'}
                  </button>
                )}
              </div>
            </div>

            {/* Key facts row */}
            <div className="flex flex-wrap gap-x-xl gap-y-xs text-sm">
              <span>
                <span className="text-neutral-400 text-xs uppercase tracking-wide mr-xs">Email</span>
                <span className="text-neutral-700 font-medium">{tenant.email}</span>
              </span>
              {tenant.phone && (
                <span>
                  <span className="text-neutral-400 text-xs uppercase tracking-wide mr-xs">Phone</span>
                  <span className="text-neutral-700 font-medium">{tenant.phone}</span>
                </span>
              )}
              {currentTenancy?.room && currentTenancy?.property && (
                <span>
                  <span className="text-neutral-400 text-xs uppercase tracking-wide mr-xs">Room</span>
                  <span className="text-neutral-700 font-medium">{currentTenancy.room.name} · {currentTenancy.property.address}</span>
                </span>
              )}
              {rent ? (
                <span>
                  <span className="text-neutral-400 text-xs uppercase tracking-wide mr-xs">Rent</span>
                  <span className="text-neutral-700 font-medium">£{rent.toLocaleString()} pcm</span>
                </span>
              ) : null}
              <span>
                <span className="text-neutral-400 text-xs uppercase tracking-wide mr-xs">Member since</span>
                <span className="text-neutral-700 font-medium">{fmtDate(tenant.created_at)}</span>
              </span>
            </div>
          </div>
        </div>

        {/* ── ID photo candidate prompt ────────────────────────────────
            Shown when reference import detected a passport / ID scan.
            Functional, small — not a marketing hero. ── */}
        {showCandidate && (
          <div className="mt-lg flex items-center gap-md rounded-xl border border-neutral-200 bg-neutral-50 px-md py-sm">
            <img
              src={candidateIdPhotoUrl}
              alt="Candidate ID"
              className="w-10 h-10 rounded-md object-cover border border-neutral-200 flex-shrink-0"
            />
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold text-neutral-700">ID document detected</p>
              <p className="text-xs text-neutral-400">Use this scan as the tenant's ID photo?</p>
            </div>
            <div className="flex items-center gap-sm flex-shrink-0">
              <button
                onClick={() => onAcceptIdPhoto?.(candidateIdPhotoUrl)}
                disabled={acceptingPhoto}
                className="text-xs font-semibold px-md py-xs rounded-lg bg-neutral-900 text-white hover:bg-neutral-700 disabled:opacity-40 transition"
              >
                {acceptingPhoto ? 'Saving…' : 'Accept'}
              </button>
              <button
                onClick={() => setDismissed(true)}
                className="text-xs text-neutral-400 hover:text-neutral-600 transition"
              >
                Dismiss
              </button>
            </div>
          </div>
        )}

      </div>
    </div>
  )
}
