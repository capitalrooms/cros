// Reads a shop receipt photo for a contractor or cleaner's invoice (Nov 2026).
// Returns the products and their prices so the person can choose which ones belong to this job. Nothing is saved here.
import Anthropic from '@anthropic-ai/sdk'

export interface ReceiptItem { name: string; amount: number }
export interface ReceiptRead { items: ReceiptItem[]; shop: string | null; readable: boolean }

const SYSTEM = [
  'You read UK shop receipts (Screwfix, B&Q, Tesco, Aldi, Lidl and similar) from a photo.',
  'List each product once with its LINE TOTAL as printed (the amount on the right). Where a line shows quantity × unit price (e.g. "2 x 3.49"), use the line total, not the unit price.',
  'Ignore: subtotals, totals, payment lines (card, cash, change), VAT summaries and VAT rate breakdowns, loyalty or Clubcard points, bag charges only if they are not a product, and the barcode or item-code numbers.',
  'Letters or asterisks beside a line (A, B, C, V, *) are VAT codes, not prices: ignore them.',
  'A discount or multibuy line (negative or "OFFER", "SAVE", "MULTIBUY") is not an item: skip it, and do not add it to the price of the item above.',
  'A refund or return (negative) is not an item: skip it.',
  'Keep product names short and as printed, e.g. "Tap washer 15mm". Amounts are numbers in pounds (no £ sign).',
  'If the photo is not a receipt or cannot be read, return readable false and an empty list.',
  'Return only JSON: {"readable": true|false, "shop": "name or null", "items": [{"name": "...", "amount": 0.00}]}',
].join(' ')

export async function readReceipt(dataUrl: string): Promise<ReceiptRead> {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) return { items: [], shop: null, readable: false }
  const m = dataUrl.match(/^data:(image\/(?:png|jpeg|webp));base64,(.+)$/)
  if (!m) return { items: [], shop: null, readable: false }
  const client = new Anthropic({ apiKey })
  const msg = await client.messages.create({
    model: 'claude-haiku-5-5',
    max_tokens: 1200,
    system: SYSTEM,
    messages: [{
      role: 'user',
      content: [
        { type: 'image', source: { type: 'base64', media_type: m[1] as 'image/png' | 'image/jpeg' | 'image/webp', data: m[2] } },
        { type: 'text', text: 'Read this receipt.' },
      ],
    }],
  }).catch(() => null)
  const text = msg?.content?.[0]?.type === 'text' ? msg.content[0].text : ''
  const json = text.match(/\{[\s\S]*\}/)?.[0]
  if (!json) return { items: [], shop: null, readable: false }
  try {
    const d = JSON.parse(json) as { readable?: boolean; shop?: string | null; items?: { name?: unknown; amount?: unknown }[] }
    const items = (Array.isArray(d.items) ? d.items : [])
      .map(i => ({ name: String(i.name ?? '').trim().slice(0, 120), amount: Math.round(Math.max(0, Number(i.amount) || 0) * 100) / 100 }))
      .filter(i => i.name && i.amount > 0)
      .slice(0, 40)
    return { items, shop: d.shop ? String(d.shop).slice(0, 80) : null, readable: !!d.readable && items.length > 0 }
  } catch {
    return { items: [], shop: null, readable: false }
  }
}
