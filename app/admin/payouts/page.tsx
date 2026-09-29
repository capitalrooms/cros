// Payouts are now part of the month-end payment run (landlords, expenses and fees together).
import { redirect } from 'next/navigation'

export default function PayoutsPage() {
  redirect('/admin/payment-run')
}
