// Emails leave CROS in one shape, whatever wrote the message (30 Oct 2026, Harry: "I never want to see this" — an old
// saved template carrying its own black band, logo, frame, footer and an "Or copy this link" box, sent inside the
// house email). Two rules, enforced where every email leaves (lib/sendEmail deliverEmail) and where saved templates are
// loaded (lib/messageTemplate):
//   1. No raw links. People press the button; a web address is never shown as text.
//   2. A saved template that brings its own design (its own logo, band, frame or footer) isn't used — the clean
//      built-in wording goes instead, and the health check names the template so it can be redone in the editor.
// Plain string work — safe in the browser too (the template editor uses it when saving).

const URL_TEXT = /^\s*(?:https?:\/\/|www\.)\S+\s*$/i

/** Take out "Or copy this link" blocks and any link or line whose visible text is just a web address. */
export function removeRawLinks(html: string): string {
  return html
    // "Or copy this link:" / "Copy and paste this link into your browser" lines
    .replace(/<(p|div|td|span)\b[^>]*>\s*(?:or\s+)?(?:copy|paste)(?:\s+and\s+paste)?[^<]{0,60}\blink\b[^<]*<\/\1>/gi, '')
    // a paragraph/box holding nothing but an address (linked or not)
    .replace(/<(p|div)\b[^>]*>\s*(?:<a\b[^>]*>)?\s*(?:https?:\/\/|www\.)[^\s<]+\s*(?:<\/a>)?\s*<\/\1>/gi, '')
    // any remaining link whose words are an address → plain words
    .replace(/<a\b([^>]*)>([^<]*)<\/a>/gi, (m, attrs, text) => URL_TEXT.test(text) ? `<a${attrs}>open the link</a>` : m)
}

/** Does this saved template bring its own design? (Then it isn't used — see above.) */
export function hasOwnDesign(text: string): string | null {
  if (/<html|<body/i.test(text)) return 'a whole email page'
  if (/<img\b/i.test(text)) return 'its own pictures or logo'
  if (/max-width\s*:\s*\d{3}px/i.test(text) && /border/i.test(text)) return 'its own frame'
  if (/background\s*:\s*#(?:1a1a1a|111|000|0a0a0a)/i.test(text)) return 'its own dark band'
  if (/innovating london living/i.test(text)) return 'its own footer'
  if (/(?:copy|paste)[^<]{0,40}\blink\b/i.test(text)) return 'a raw link to copy'
  return null
}
