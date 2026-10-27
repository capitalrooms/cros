'use client'

// The parts every staff profile shares (17 Oct 2026, Harry: "uniform code" — the admin profile and the cleaner /
// contractor / lettings profile had drifted apart). One copy of each: the text and letter sign-off previews,
// Password & sign-in, and Install the app.
import Link from 'next/link'

/** "Jacob, Capital Rooms | 07…" — what texts end with (the same rule as getSmsSignOff in lib/auth) */
export const smsSignOffText = (preferred: string, first: string, phone: string, email: string) => {
  const name = preferred.trim() || first.trim() || 'Your Name'
  const contact = phone.trim() || email
  return contact ? `${name}, Capital Rooms | ${contact}` : `${name}, Capital Rooms`
}

export function SignOffPreview({ smsSignOff, letterName, jobTitle, phone }: { smsSignOff: string; letterName: string; jobTitle?: string; phone?: string }) {
  return (
    <div className="grid gap-md sm:grid-cols-2">
      <div className="rounded-xl border border-neutral-200 bg-neutral-50 p-md">
        <p className="mb-sm text-xs font-semibold uppercase tracking-wide text-neutral-500">Texts end with</p>
        <div className="flex justify-end">
          <div className="max-w-xs rounded-2xl rounded-br-sm bg-neutral-800 px-md py-sm text-sm leading-relaxed text-white">…Please get in touch if you have any questions. <span className="text-neutral-300">-{smsSignOff}</span></div>
        </div>
        {!phone?.trim() && <p className="mt-sm text-xs text-amber-600">No mobile set — your email address is used instead. Add a number so people can text back.</p>}
      </div>
      <div className="rounded-xl border border-neutral-200 bg-neutral-50 p-md">
        <p className="mb-sm text-xs font-semibold uppercase tracking-wide text-neutral-500">Letters are signed</p>
        <p className="mb-sm text-xs text-neutral-400">Yours sincerely,</p>
        <p className="mb-sm text-xs italic text-neutral-300">[signature]</p>
        <p className="text-sm font-bold text-neutral-900">{letterName || 'Your Name'}</p>
        {jobTitle && <p className="mt-xs text-xs text-neutral-500">{jobTitle}</p>}
        {phone && <p className="text-xs text-neutral-500">{phone}</p>}
      </div>
    </div>
  )
}

export function PasswordLink({ className = '' }: { className?: string }) {
  return (
    <a href="/account" className={`flex items-center justify-between rounded-2xl border border-neutral-200 bg-white px-lg py-md hover:bg-neutral-50 ${className}`}>
      <span><span className="block text-sm font-semibold text-neutral-900">Password &amp; sign-in</span><span className="block text-xs text-neutral-500">Change your password or turn on two-step sign-in</span></span>
      <span className="text-neutral-400">→</span>
    </a>
  )
}

export function InstallAppLink({ className = '' }: { className?: string }) {
  return (
    <Link href="/install" className={`group flex items-center justify-between rounded-2xl border border-neutral-200 bg-white px-lg py-md transition hover:bg-neutral-50 ${className}`}>
      <span className="flex items-center gap-md"><span className="text-2xl">📲</span><span><span className="block text-sm font-bold text-neutral-900">Install the app</span><span className="mt-xs block text-xs text-neutral-500">Add to Home Screen to unlock push notifications, Share Sheet and more</span></span></span>
      <span className="shrink-0 text-lg text-neutral-400 transition group-hover:text-neutral-700">›</span>
    </Link>
  )
}
