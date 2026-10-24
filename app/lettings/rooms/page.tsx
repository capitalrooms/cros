// The old lettings Rooms list (24 Oct 2026): nothing linked to it any more and it read retired columns (rooms.status,
// current_rent/asking_rent), so every room showed "£—" and a wrong status. The marketing board is the rooms list now;
// an old bookmark lands there.
import { redirect } from 'next/navigation'

export default function RoomsManagement() {
  redirect('/lettings/board')
}
