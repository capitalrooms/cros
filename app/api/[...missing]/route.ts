// Any /api path with no route of its own lands here and gets a JSON 404.
// Without this, a request carrying an Authorization header (every admin fetch does) is answered by
// Vercel with the HTML not-found page and status 200 — so a mistyped or removed endpoint looked like success.
import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

const notFound = () => NextResponse.json({ error: 'No such API route' }, { status: 404 })

export { notFound as GET, notFound as POST, notFound as PUT, notFound as PATCH, notFound as DELETE }
