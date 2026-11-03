// Keeping a holding deposit (Tenant Fees Act 2019, sch.2 paras 5–12): only for one of four reasons, and the applicant
// must be told in writing why within 7 days of deciding to keep it (3 Nov 2026). The letter is previewed and sent by
// the office — never on its own.
export const RETAIN_GROUNDS: Record<string, string> = {
  right_to_rent: 'you did not pass the Right to Rent check',
  false_information: 'you gave false or misleading information that we reasonably relied on in deciding to grant the tenancy',
  withdrew: 'you decided not to go ahead with the tenancy',
  deadline: 'you did not take all reasonable steps to enter into the tenancy agreement by the deadline agreed',
}

export function retainLetter(o: { dear: string; amount: number; holdNo: string; receivedOn: string; place: string; ground: string; reason: string; decidedOn: string }): { subject: string; text: string } {
  const pounds = `£${o.amount.toFixed(2)}`
  return {
    subject: `Your holding deposit ${o.holdNo} — why we are keeping it`,
    text: `Dear ${o.dear},

We are writing about the holding deposit of ${pounds} (${o.holdNo}) you paid on ${o.receivedOn} for ${o.place}.

We have decided to keep it because ${RETAIN_GROUNDS[o.ground] ?? o.ground}.

${o.reason}

The Tenant Fees Act 2019 allows a holding deposit to be kept for this reason, and requires us to tell you in writing within 7 days of deciding to keep it — we decided on ${o.decidedOn}.

If you think this is wrong, please reply to this email and we will look at it again.

Kind regards,
Capital Rooms`,
  }
}
