// POST /api/lettings/video-call — staff (admin or lettings) start the video call step after the holding deposit is paid.
import { getCurrentUser } from '@/lib/serverAuth'
import { createCallRequest } from '@/lib/calls/server'
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export async function POST(request: Request) {
  const user = await getCurrentUser()
  const role = (user?.assignment as any)?.role || ''
  if (!user || !['administrator', 'admin', 'lettings'].includes(role)) return Response.json({ error: 'Unauthorized' }, { status: 401 })
  const b = await request.json().catch(() => ({})) as any
  if (!b.applicantEmail || !b.landlordId) return Response.json({ error: 'Missing applicant email or landlord.' }, { status: 400 })
  try {
    const row = await createCallRequest({ applicantEmail: String(b.applicantEmail), applicantName: String(b.applicantName || ''), landlordId: String(b.landlordId), propertyId: b.propertyId || null, roomId: b.roomId || null, createdBy: user.email ?? role })
    return Response.json({ ok: true, id: row.id })
  } catch (e: any) { return Response.json({ error: e?.message || 'Could not start the call step.' }, { status: 500 }) }
}
