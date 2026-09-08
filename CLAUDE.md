@AGENTS.md

## UI Conventions

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
