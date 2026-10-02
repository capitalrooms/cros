// Plain-text message → email HTML: blank lines split paragraphs, "•"/"-" lines become a list.
// Used where staff write the email themselves (bulk agreements, Document Generator).
const esc = (s: string) => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!))

export function messageHtml(text: string): string {
  const P = 'margin:0 0 16px;font-size:15px;color:#333;line-height:1.6'
  return text.replace(/\r/g, '').trim().split(/\n\s*\n/).map(block => {
    const lines = block.split('\n')
    if (lines.every(l => /^\s*[•\-*]\s+/.test(l))) {
      return `<ul style="margin:0 0 16px;padding-left:20px;font-size:15px;color:#333;line-height:1.7">${lines.map(l => `<li>${esc(l.replace(/^\s*[•\-*]\s+/, ''))}</li>`).join('')}</ul>`
    }
    return `<p style="${P}">${lines.map(esc).join('<br>')}</p>`
  }).join('\n')
}
