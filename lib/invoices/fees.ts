// Agent fees charged to landlords for tenancy paperwork, and where they are paid.
export type FeeCode = 'agreement' | 'tenant_reference' | 'guarantor_signatory' | 'guarantor_reference'

export const FEES: Record<FeeCode, { label: string; amount: number }> = {
  agreement:           { label: 'Tenancy agreement prepared and signed', amount: 75 },
  tenant_reference:    { label: 'Tenant referencing',                    amount: 25 },
  guarantor_signatory: { label: 'Guarantor added as signatory',          amount: 25 },
  guarantor_reference: { label: 'Guarantor referencing',                 amount: 25 },
}

export const AGENT_BANK = {
  accountName: 'Capital Rooms Ltd',
  sortCode: '20-18-93',
  accountNumber: '2377 2241',
}

export const INVOICE_PAYMENT_DAYS = 14
