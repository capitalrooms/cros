/**
 * Address formatting utilities.
 *
 * Addresses in the DB may be stored as:
 *   a) Newline-separated  "75 High Street\nBuckden\nPE19 5TA"  (new format)
 *   b) Comma-separated    "75 High Street, Buckden, PE19 5TA"  (legacy format)
 *
 * Use the right helper for each context.
 */

/** For inline / label use — single line, comma-separated. */
export function inlineAddress(addr: string | null | undefined): string {
  if (!addr) return ''
  return addr.replace(/\n/g, ', ')
}

/**
 * For dedicated address block display — each line on its own row.
 * Works with both new (\n) and legacy (, ) formats.
 * Pair with className="whitespace-pre-line" on the element.
 */
export function blockAddress(addr: string | null | undefined): string {
  if (!addr) return ''
  // Already newline-separated
  if (addr.includes('\n')) return addr
  // Convert comma-separated to newlines
  return addr
    .split(',')
    .map(p => p.trim())
    .filter(Boolean)
    .join('\n')
}

/**
 * Address for use in generated text (emails, PDFs, strings) — inline comma form.
 */
export const textAddress = inlineAddress
