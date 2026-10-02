// Next.js passes a page its query string as a promise (`searchParams`); client pages read it with React's use().
// Reading it this way — rather than useSearchParams() inside <Suspense> — makes the page render with the real
// query on the server and start normally on every load. The Suspense version never ran its start-up code on a
// fresh load or refresh under the admin layout (it only woke up on the first click).
export type PageSearchParams = Promise<Record<string, string | string[] | undefined>>

export const one = (v: string | string[] | undefined): string | undefined => (Array.isArray(v) ? v[0] : v)
