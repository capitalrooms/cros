// What an agreement says, in order — recorded by the PDF generators (generatePDF.ts, rentCollectionPDF.ts) as they
// draw, so the Word version (docx.ts) is built from exactly the same words as the PDF and can never drift from it.
export type AgreementBlock =
  | { kind: 'title'; text: string; sub: string; date: string }
  | { kind: 'label'; text: string }
  | { kind: 'para'; text: string; bold?: boolean; small?: boolean; muted?: boolean; indent?: boolean }
  | { kind: 'clause'; num: string; title: string; text: string }
  | { kind: 'bullets'; items: string[] }
  | { kind: 'table'; head: [string, string]; rows: [string, string][] }
  | { kind: 'signatures'; left: string; right: string; rightRole: string; rightName?: string | null }
