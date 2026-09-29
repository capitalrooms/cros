@AGENTS.md

## UI Conventions

### Admin page layout — the standard

Every new admin page **must** follow this layout pattern exactly. It is the enforced default.

```tsx
'use client'

import AppBar from '@/components/AppBar'          // ← correct path — NOT @/app/components/AppBar
import BackButton from '@/app/components/BackButton'

export default function MyAdminPage() {
  return (
    <div className="min-h-screen bg-neutral-100">
      <AppBar left={<BackButton href="/admin" />} title="Page Title" />
      <div className="mx-auto max-w-6xl px-lg py-xl">
        {/* page content */}
      </div>
    </div>
  )
}
```

Key rules:
- **AppBar import**: always `@/components/AppBar` — this version is admin-context-aware and returns null inside the admin layout (preventing a double header). The path `@/app/components/AppBar` is the old version that always renders a black banner and **must never be used in admin pages**.
- **Outer wrapper**: `min-h-screen bg-neutral-100`
- **Content wrapper**: `mx-auto max-w-6xl px-lg py-xl`
- Never use `max-w-5xl`, `max-w-7xl`, `max-w-4xl`, or any other max-width.
- Never use `py-lg`, `py-2xl`, `px-xl`, `px-md` on the content wrapper — always `px-lg py-xl`.

### Back navigation — always use `BackButton`

Every admin (and lettings/cleaner) sub-page that has a back control in the AppBar **must** use
`<BackButton href="…" />` from `@/app/components/BackButton`, not a custom text link.

```tsx
// ✅ Correct
import BackButton from '@/app/components/BackButton'
<AppBar left={<BackButton href="/admin" />} />

// ❌ Wrong — never do this in the AppBar
<AppBar left={<Link href="/admin">← Dashboard</Link>} />
<AppBar right={<Link href="/admin">← Admin</Link>} />
```

This applies to **both** the loading-state AppBar and the main-render AppBar on every page.
In-page back buttons inside multi-step forms (not in the AppBar) are exempt.
