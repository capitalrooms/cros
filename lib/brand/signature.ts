// Capital Rooms email signature — the house style chosen 27 Sep 2026 (layout A "disc beside",
// Space Grotesk name, monospace details, dark reply bar). Used by the Gmail signature generator
// and, later, as the footer on system emails sent in a person's name.
//
// Email apps ignore web fonts, so the name is an image (see /api/brand/signature-name) and everything
// else is live text in a monospace every computer and phone has. Images set a width and let the
// height follow, so nothing is squashed on phones.

export interface SignaturePerson {
  name: string          // "Harry Buchanan"
  title: string         // "Property Manager"
  phone: string         // "+44 7506 790 741"
  email: string         // "harry@capitalrooms.co.uk"
}

export const SIGNATURE_ASSET_BASE = 'https://cros-sigma.vercel.app'
const F = "Lato,'Helvetica Neue',Arial,sans-serif"
const MONO = "'SF Mono','SFMono-Regular',Menlo,Consolas,'Roboto Mono','Liberation Mono',monospace"
const BG = '#0d0d0d'
const ADDRESS = 'Capital Rooms Ltd &nbsp;·&nbsp; Hoxton Mix, 66 Paul Street, London EC2A 4NA'

const esc = (s: string) => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!))
const telHref = (phone: string) => {
  const digits = phone.replace(/[^\d+]/g, '')
  return digits.startsWith('0') ? `+44${digits.slice(1)}` : digits
}

/** Hosted URL of the person's name drawn in the house font. */
export function signatureNameUrl(name: string, tone: 'light' | 'ink' = 'light', base = SIGNATURE_ASSET_BASE) {
  return `${base}/api/brand/signature-name?n=${encodeURIComponent(name.trim().toUpperCase())}&t=${tone}`
}

const img = (src: string, w: number, alt: string) =>
  `<img src="${src}" width="${w}" alt="${esc(alt)}" style="display:block;border:0;outline:none;width:${w}px;max-width:100%;height:auto;">`
const rule = (c: string) => `<div style="border-top:1px solid ${c};font-size:0;line-height:0;height:1px;">&nbsp;</div>`
const mono = (text: string, color: string, size: number, spacing: string) =>
  `<div style="font-family:${MONO};font-size:${size}px;letter-spacing:${spacing};text-transform:uppercase;color:${color};line-height:1.8;">${text}</div>`

const CREDS = [
  { k: 'tpo', w: 60, alt: 'The Property Ombudsman' },
  { k: 'cmp', w: 86, alt: 'Client Money Protect' },
  { k: 'dps', w: 22, alt: 'Deposit Protection Service' },
  { k: 'google', w: 90, alt: 'Rated 4.9 out of 5 on Google' },
]

/**
 * Full signature (new emails). `nameWidth` is the name image's display width in px — the
 * generator reads it from the image; for fixed people it can be stored.
 */
export function fullSignatureHtml(p: SignaturePerson, nameWidth: number, base = SIGNATURE_ASSET_BASE, opts: { disclaimer?: boolean } = {}): string {
  const tel = esc(p.phone), mail = esc(p.email)
  const nameHtml = nameWidth > 0
    ? `<div style="line-height:0;">${img(signatureNameUrl(p.name, 'light', base), nameWidth, p.name)}</div>`
    : `<div style="font-family:${F};font-size:15px;font-weight:700;letter-spacing:.14em;text-transform:uppercase;color:#f1efea;line-height:1.2;">${esc(p.name)}</div>`
  const creds = CREDS.map(c => `<span style="display:inline-block;vertical-align:middle;margin:0 20px 10px 0;">${img(`${base}/brand/${c.k}-grey.png`, c.w, c.alt)}</span>`).join('')
  return `<div style="max-width:600px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="${BG}" style="width:100%;max-width:600px;background:${BG};border-collapse:collapse;font-family:${F};">
  <tr>
    <td valign="middle" width="108" style="width:108px;padding:22px 0 16px 22px;">${img(`${base}/brand/disc-small.png`, 86, 'Capital Rooms')}</td>
    <td valign="middle" style="padding:22px 22px 16px 14px;">
      ${nameHtml}
      <div style="height:4px;font-size:0;line-height:0;">&nbsp;</div>
      ${mono(esc(p.title), '#8d8a84', 10.5, '.18em')}
      <div style="font-family:${MONO};font-size:12.5px;line-height:1.7;margin-top:8px;color:#d6d3cd;">
        <a href="tel:${telHref(p.phone)}" style="color:#d6d3cd;text-decoration:none;">${tel}</a><br>
        <a href="mailto:${mail}" style="color:#d6d3cd;text-decoration:none;">${mail}</a>
      </div>
    </td>
  </tr>
  <tr><td colspan="2" style="padding:0 22px;">${rule('#222120')}</td></tr>
  <tr><td colspan="2" style="padding:16px 22px 6px;"><div style="font-size:0;line-height:0;">${creds}</div></td></tr>
  <tr><td colspan="2" style="padding:0 22px 18px;">
    <div style="font-family:${MONO};font-size:9.5px;letter-spacing:.14em;text-transform:uppercase;line-height:1.8;"><a href="https://www.capitalrooms.co.uk" style="color:#9a978f;text-decoration:none;">www.capitalrooms.co.uk</a></div>
    ${mono(`© ${new Date().getFullYear()} ${ADDRESS}`, '#57554f', 8, '.12em')}
  </td></tr>
</table>${opts.disclaimer === false ? '' : `
<div style="font-family:${F};font-size:10px;line-height:1.55;color:#8a867e;margin-top:10px;max-width:600px;">This email and any attachments are intended for the recipient only. If you have received it in error, please tell the sender and delete it.</div>`}</div>`
}

/** Short signature for replies — a slim dark bar. */
export function replySignatureHtml(p: SignaturePerson, nameWidth: number, base = SIGNATURE_ASSET_BASE): string {
  const tel = esc(p.phone), mail = esc(p.email)
  return `<table role="presentation" cellpadding="0" cellspacing="0" bgcolor="${BG}" style="background:${BG};border-collapse:separate;border-radius:12px;font-family:${F};"><tr>
  <td valign="middle" width="70" style="width:70px;min-width:70px;padding:10px 10px 10px 12px;">${img(`${base}/brand/disc-small.png`, 52, 'Capital Rooms')}</td>
  <td valign="middle" style="padding:10px 18px 10px 12px;border-left:1px solid #262523;">
    ${img(signatureNameUrl(p.name, 'light', base), Math.round(nameWidth * 0.82), p.name)}
    <div style="font-family:${MONO};font-size:12px;color:#a7a39b;margin-top:5px;line-height:1.5;"><a href="tel:${telHref(p.phone)}" style="color:#d6d3cd;text-decoration:none;">${tel}</a> &nbsp;<span style="color:#4a4845;">/</span>&nbsp; <a href="mailto:${mail}" style="color:#d6d3cd;text-decoration:none;">${mail}</a><br><a href="https://www.capitalrooms.co.uk" style="color:#8d8a84;text-decoration:none;">capitalrooms.co.uk</a></div>
  </td></tr></table>`
}

/** Plain-text fallback for the clipboard. */
export const signatureText = (p: SignaturePerson) =>
  `${p.name}\n${p.title}\n${p.phone}\n${p.email}\nwww.capitalrooms.co.uk`
