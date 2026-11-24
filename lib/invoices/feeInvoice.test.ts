// Run: node --experimental-strip-types lib/invoices/feeInvoice.test.ts
import { outstanding, overpaid, daysOverdue, statusOf } from './feeInvoice.ts'

let failed = 0
const check = (name: string, got: unknown, want: unknown) => {
  const ok = JSON.stringify(got) === JSON.stringify(want)
  if (!ok) failed++
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${ok ? '' : `  got ${JSON.stringify(got)} want ${JSON.stringify(want)}`}`)
}
const inv = { total_amount: 600, due_on: '2026-12-01', voided_at: null }
check('nothing paid: all owed', outstanding(inv, []), 600)
check('part paid', outstanding(inv, [{ amount: 250 }]), 350)
check('paid in full', outstanding(inv, [{ amount: 600 }]), 0)
check('reversal adds back to owed', outstanding(inv, [{ amount: 600 }, { amount: -100 }]), 100)
check('overpaid shown separately', overpaid(inv, [{ amount: 650 }]), 50)
check('overpaid never negative', overpaid(inv, [{ amount: 100 }]), 0)
check('not yet due: 0 days', daysOverdue(inv, [], '2026-11-30'), 0)
check('due day itself: 0 days', daysOverdue(inv, [], '2026-12-01'), 0)
check('5 days past due', daysOverdue(inv, [], '2026-12-06'), 5)
check('paid: 0 days even if late', daysOverdue(inv, [{ amount: 600 }], '2026-12-20'), 0)
check('status open', statusOf(inv, [], '2026-11-30'), 'open')
check('status overdue', statusOf(inv, [], '2026-12-06'), 'overdue')
check('status part paid', statusOf(inv, [{ amount: 100 }], '2026-11-30'), 'part_paid')
check('status part paid overdue', statusOf(inv, [{ amount: 100 }], '2026-12-06'), 'part_paid_overdue')
check('status paid', statusOf(inv, [{ amount: 600 }], '2026-12-06'), 'paid')
check('status void', statusOf({ ...inv, voided_at: '2026-11-25T10:00:00Z' }, [], '2026-12-06'), 'void')
check('void owes nothing', outstanding({ ...inv, voided_at: '2026-11-25T10:00:00Z' }, []), 0)
console.log(failed ? `${failed} FAILED` : 'all fee invoice checks passed')
process.exit(failed ? 1 : 0)
