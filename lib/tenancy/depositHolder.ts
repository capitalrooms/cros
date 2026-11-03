// Who holds a tenancy's deposit is decided when the tenancy is set up, never later at the finance stage (Harry, 3 Nov
// 2026: "it should be clarified from tenancy inception and if it is let only then obviously the landlord"). Let-only
// (the house, or just the room): the landlord. Managed: Capital Rooms, as agent. Migration 257 applies the same rule in
// the database, so every way a tenancy is made gets it.
export type DepositHolder = 'agent' | 'landlord'

export const isLetOnly = (lettingType?: string | null, roomLetOnly?: boolean | null) => lettingType === 'let_only' || !!roomLetOnly

export const depositHolderFor = (lettingType?: string | null, roomLetOnly?: boolean | null): DepositHolder =>
  isLetOnly(lettingType, roomLetOnly) ? 'landlord' : 'agent'
