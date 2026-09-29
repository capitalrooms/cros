// Renders a Word tenancy-agreement template onto the Capital Rooms PDF letterhead.
// The template supplies wording, emphasis, numbering, boxes and tables; the letterhead
// (lib/pdfLetterhead.ts) supplies logo, footer, fonts and margins.

import path from 'path'
import JSZip from 'jszip'
import { DOMParser } from '@xmldom/xmldom'
import {
  loadPDFLetterheadAssets, drawPDFFooter,
  PAGE_W, PAGE_H, MARGIN, FOOTER_BAND_H, LOGO_W, LOGO_H, BLACK,
  type PDFBizSettings,
} from '@/lib/pdfLetterhead'

// eslint-disable-next-line @typescript-eslint/no-require-imports
const PDFDocument = require('pdfkit') as typeof import('pdfkit')

export type BillKey = 'water' | 'gas' | 'tv_licence' | 'broadband' | 'electricity' | 'telephone' | 'council_tax'
export type BillsConfig = Record<BillKey, 'landlord' | 'tenant'>

const W_NS = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'
const LANDLORD_TEXT = 'The landlord is responsible'
const TENANT_TEXT = 'You and your fellow tenants pay'
const BILL_ROWS: [BillKey, string][] = [
  ['water', 'Water charges:'], ['gas', 'Gas:'], ['tv_licence', 'Television licence:'], ['broadband', 'Broadband:'],
  ['electricity', 'Electricity:'], ['telephone', 'Telephone:'], ['council_tax', 'Council tax:'],
]
const BILL_LABEL_RE = /^(water charges|gas|television licen[cs]e|broadband|electricity|telephone|council tax):?$/i

const COL_W = PAGE_W - MARGIN * 2
const CONTENT_TOP = MARGIN + LOGO_H + 14
const CONTENT_BOTTOM = PAGE_H - FOOTER_BAND_H - 14
const BODY_PT = 9.5

// ── Model ────────────────────────────────────────────────────────────────────

interface Run { text: string; bold: boolean; italic: boolean; underline: boolean; color: string; size: number; tick?: boolean }
interface Box { fill?: string; border?: string; widthRatio: number; blocks: Block[] }
interface Para {
  kind: 'p'; runs: Run[]; align: 'left' | 'center' | 'right' | 'justify'
  indLeft: number; indRight: number; hanging: number; firstLine: number
  before: number; after: number; lineGap: number; size: number
  label?: Run; shade?: string; boxes: Box[]; pageBreakAfter: boolean; pageBreakBefore: boolean
}
interface Cell { span: number; fill?: string; blocks: Block[]; skip: boolean }
interface Table { kind: 'table'; cols: number[]; rows: Cell[][]; borders: boolean }
type Block = Para | Table | { kind: 'bills' } | { kind: 'pagebreak' }

// ── XML helpers ──────────────────────────────────────────────────────────────

type El = Element
const kids = (el: Node): El[] => Array.from(el.childNodes || []).filter((n): n is El => n.nodeType === 1) as El[]
const child = (el: El | undefined, name: string) => el ? kids(el).find(k => k.localName === name) : undefined
const wattr = (el: El | undefined, name: string) => el ? (el.getAttributeNS(W_NS, name) || el.getAttribute('w:' + name) || '') : ''
function descendants(el: El, name: string, stopAt: string[] = []): El[] {
  const out: El[] = []
  const walk = (n: El) => {
    for (const k of kids(n)) {
      if (k.localName === name) out.push(k)
      if (!stopAt.includes(k.localName)) walk(k)
    }
  }
  walk(el)
  return out
}
const onOff = (el: El | undefined) => !!el && !['0', 'false', 'off'].includes(wattr(el, 'val'))

// ── Styles & numbering ───────────────────────────────────────────────────────

interface PProps { jc?: string; indLeft?: number; indRight?: number; hanging?: number; firstLine?: number; before?: number; after?: number; line?: number; numId?: string; ilvl?: number; shade?: string; pageBreakBefore?: boolean }
interface RProps { b?: boolean; i?: boolean; u?: boolean; color?: string; sz?: number; caps?: boolean; vanish?: boolean }

function readPPr(pPr: El | undefined): PProps {
  const o: PProps = {}
  if (!pPr) return o
  const jc = child(pPr, 'jc'); if (jc) o.jc = wattr(jc, 'val')
  const ind = child(pPr, 'ind')
  if (ind) {
    const n = (a: string) => { const v = wattr(ind, a); return v === '' ? undefined : parseInt(v, 10) }
    const l = n('left') ?? n('start'); if (l !== undefined) o.indLeft = l
    const r = n('right') ?? n('end'); if (r !== undefined) o.indRight = r
    const h = n('hanging'); if (h !== undefined) o.hanging = h
    const f = n('firstLine'); if (f !== undefined) o.firstLine = f
  }
  const sp = child(pPr, 'spacing')
  if (sp) {
    const n = (a: string) => { const v = wattr(sp, a); return v === '' ? undefined : parseInt(v, 10) }
    if (n('before') !== undefined) o.before = n('before')
    if (n('after') !== undefined) o.after = n('after')
    if (n('line') !== undefined && (wattr(sp, 'lineRule') || 'auto') === 'auto') o.line = n('line')
  }
  const numPr = child(pPr, 'numPr')
  if (numPr) {
    const id = child(numPr, 'numId'); if (id) o.numId = wattr(id, 'val')
    const lv = child(numPr, 'ilvl'); if (lv) o.ilvl = parseInt(wattr(lv, 'val') || '0', 10)
  }
  const shd = child(pPr, 'shd'); const fill = shd ? wattr(shd, 'fill') : ''
  if (fill && fill !== 'auto' && fill.toUpperCase() !== 'FFFFFF') o.shade = '#' + fill
  if (child(pPr, 'pageBreakBefore') && onOff(child(pPr, 'pageBreakBefore'))) o.pageBreakBefore = true
  return o
}

function readRPr(rPr: El | undefined): RProps {
  const o: RProps = {}
  if (!rPr) return o
  const b = child(rPr, 'b'); if (b) o.b = onOff(b)
  const i = child(rPr, 'i'); if (i) o.i = onOff(i)
  const u = child(rPr, 'u'); if (u) o.u = !['none', ''].includes(wattr(u, 'val') || 'single')
  const c = child(rPr, 'color'); const cv = c ? wattr(c, 'val') : ''
  if (cv && cv !== 'auto') o.color = '#' + cv
  const sz = child(rPr, 'sz'); if (sz) o.sz = parseInt(wattr(sz, 'val'), 10)
  const caps = child(rPr, 'caps'); if (caps) o.caps = onOff(caps)
  const vanish = child(rPr, 'vanish'); if (vanish) o.vanish = onOff(vanish)
  return o
}

interface StyleDef { basedOn?: string; p: PProps; r: RProps }
interface NumLevel { fmt: string; text: string; start: number; indLeft?: number; hanging?: number }

class DocxModel {
  styles = new Map<string, StyleDef>()
  defaultR: RProps = {}
  defaultParaStyle = 'Normal'
  numToAbs = new Map<string, string>()
  startOverrides = new Map<string, Map<number, number>>()
  absLevels = new Map<string, Map<number, NumLevel>>()
  counters = new Map<string, number[]>()
  theme: Record<string, string> = {}

  constructor(stylesXml: string | null, numberingXml: string | null, themeXml: string | null) {
    if (themeXml) {
      for (const m of themeXml.matchAll(/<a:(dk1|lt1|dk2|lt2|accent\d|hlink|folHlink)>([\s\S]*?)<\/a:\1>/g)) {
        const v = /lastClr="([0-9A-Fa-f]{6})"/.exec(m[2]) || /val="([0-9A-Fa-f]{6})"/.exec(m[2])
        if (v) this.theme[m[1]] = v[1].toUpperCase()
      }
    }
    if (stylesXml) {
      const d = new DOMParser().parseFromString(stylesXml, 'text/xml')
      const dd = d.getElementsByTagNameNS(W_NS, 'rPrDefault')[0]
      if (dd) this.defaultR = readRPr(child(dd as El, 'rPr'))
      for (const s of Array.from(d.getElementsByTagNameNS(W_NS, 'style')) as El[]) {
        const id = wattr(s, 'styleId')
        if (wattr(s, 'type') === 'paragraph' && wattr(s, 'default') === '1') this.defaultParaStyle = id
        this.styles.set(id, { basedOn: wattr(child(s, 'basedOn'), 'val') || undefined, p: readPPr(child(s, 'pPr')), r: readRPr(child(s, 'rPr')) })
      }
    }
    if (numberingXml) {
      const d = new DOMParser().parseFromString(numberingXml, 'text/xml')
      for (const a of Array.from(d.getElementsByTagNameNS(W_NS, 'abstractNum')) as El[]) {
        const levels = new Map<number, NumLevel>()
        for (const l of kids(a).filter(k => k.localName === 'lvl')) {
          const p = readPPr(child(l, 'pPr'))
          levels.set(parseInt(wattr(l, 'ilvl'), 10), {
            fmt: wattr(child(l, 'numFmt'), 'val') || 'decimal',
            text: wattr(child(l, 'lvlText'), 'val'),
            start: parseInt(wattr(child(l, 'start'), 'val') || '1', 10),
            indLeft: p.indLeft, hanging: p.hanging,
          })
        }
        this.absLevels.set(wattr(a, 'abstractNumId'), levels)
      }
      for (const n of Array.from(d.getElementsByTagNameNS(W_NS, 'num')) as El[]) {
        const id = wattr(n, 'numId')
        this.numToAbs.set(id, wattr(child(n, 'abstractNumId'), 'val'))
        const ov = new Map<number, number>()
        for (const o of kids(n).filter(k => k.localName === 'lvlOverride')) {
          const so = child(o, 'startOverride')
          if (so) ov.set(parseInt(wattr(o, 'ilvl'), 10), parseInt(wattr(so, 'val'), 10))
        }
        this.startOverrides.set(id, ov)
      }
    }
  }

  styleChain(id: string | undefined): StyleDef[] {
    const out: StyleDef[] = []
    let cur = id
    const seen = new Set<string>()
    while (cur && this.styles.has(cur) && !seen.has(cur)) {
      seen.add(cur)
      const s = this.styles.get(cur)!
      out.unshift(s)
      cur = s.basedOn
    }
    return out
  }

  paraProps(styleId: string | undefined, direct: PProps): { p: PProps; r: RProps } {
    const chain = this.styleChain(styleId || this.defaultParaStyle)
    const p: PProps = {}
    let r: RProps = { ...this.defaultR }
    for (const s of chain) { Object.assign(p, s.p); r = { ...r, ...s.r } }
    Object.assign(p, direct)
    return { p, r }
  }

  levelFor(numId: string, ilvl: number): NumLevel | undefined {
    const abs = this.numToAbs.get(numId)
    return abs ? this.absLevels.get(abs)?.get(ilvl) : undefined
  }

  nextLabel(numId: string, ilvl: number): string | undefined {
    const abs = this.numToAbs.get(numId)
    const levels = abs ? this.absLevels.get(abs) : undefined
    if (!levels) return undefined
    const lvl = levels.get(ilvl)
    if (!lvl) return undefined
    const counts = this.counters.get(numId) || []
    const startOf = (l: number) => this.startOverrides.get(numId)?.get(l) ?? levels.get(l)?.start ?? 1
    counts[ilvl] = counts[ilvl] === undefined ? startOf(ilvl) : counts[ilvl] + 1
    for (let d = ilvl + 1; d < 9; d++) counts[d] = undefined as unknown as number
    this.counters.set(numId, counts)
    if (lvl.fmt === 'bullet') return mapBullet(lvl.text)
    if (lvl.fmt === 'none') return ''
    return lvl.text.replace(/%(\d)/g, (_, n) => {
      const l = parseInt(n, 10) - 1
      const v = counts[l] ?? startOf(l)
      return formatNumber(v, levels.get(l)?.fmt || 'decimal')
    })
  }
}

function mapBullet(t: string): string {
  if (!t || t === '' || t === '·' || t === '' || t === '' || t === '') return '•'
  if (t === 'o') return '–'
  if (t === '' || t === '') return '✓'
  return t
}

function formatNumber(n: number, fmt: string): string {
  switch (fmt) {
    case 'lowerLetter': return String.fromCharCode(96 + ((n - 1) % 26) + 1)
    case 'upperLetter': return String.fromCharCode(64 + ((n - 1) % 26) + 1)
    case 'lowerRoman': return toRoman(n).toLowerCase()
    case 'upperRoman': return toRoman(n)
    default: return String(n)
  }
}
function toRoman(n: number): string {
  const m: [number, string][] = [[1000, 'M'], [900, 'CM'], [500, 'D'], [400, 'CD'], [100, 'C'], [90, 'XC'], [50, 'L'], [40, 'XL'], [10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I']]
  let out = ''
  for (const [v, s] of m) while (n >= v) { out += s; n -= v }
  return out
}

// ── Parsing ──────────────────────────────────────────────────────────────────

const TWIP_X = COL_W / 546        // Word text width 546pt → letterhead column
const FONT_SCALE = BODY_PT / 11   // Word body 11pt → letterhead 9.5pt
const twipX = (v: number | undefined) => ((v || 0) / 20) * TWIP_X
const twipY = (v: number | undefined) => ((v || 0) / 20) * FONT_SCALE
const EMU_PT = 1 / 12700

function cleanText(s: string): string {
  return s
    .replace(//g, '•').replace(//g, '•')
    .replace(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}️‍]/gu, (ch) => (ch === '✓' || ch === '✔' || ch === '✅' ? ch : ''))
}

function splitTicks(r: Run): Run[] {
  const parts = r.text.split(/([✓✔✅])/u)
  return parts.filter(p => p !== '').map(p => (/^[✓✔✅]$/u.test(p) ? { ...r, text: p === '✅' ? 'badge' : 'tick', tick: true, underline: false } : { ...r, text: p }))
}

class Parser {
  constructor(private m: DocxModel, private values: Record<string, string>, private omit: RegExp[] = [], private rewrites: Rewrite[] = []) {}

  blocks(container: El): Block[] {
    const out: Block[] = []
    for (const k of kids(container)) {
      if (k.localName === 'p') out.push(...this.paragraph(k))
      else if (k.localName === 'tbl') out.push(this.table(k))
      else if (k.localName === 'sdt') { const c = child(k, 'sdtContent'); if (c) out.push(...this.blocks(c)) }
      else if (k.localName === 'customXml') out.push(...this.blocks(k))
    }
    return out
  }

  paragraph(p: El): Block[] {
    const pPr = child(p, 'pPr')
    const styleId = wattr(child(pPr, 'pStyle'), 'val') || undefined
    const { p: pp, r: baseR } = this.m.paraProps(styleId, readPPr(pPr))

    const runs: Run[] = []
    const boxes: Box[] = []
    let pageBreakAfter = false
    let pageBreakBefore = !!pp.pageBreakBefore
    const collectRuns = (el: El) => {
      for (const k of kids(el)) {
        const n = k.localName
        if (n === 'r') this.run(k, baseR, runs, boxes, () => { if (runs.some(r => r.text.trim())) pageBreakAfter = true; else pageBreakBefore = true })
        else if (['hyperlink', 'smartTag', 'ins', 'customXml', 'fldSimple'].includes(n)) collectRuns(k)
        else if (n === 'sdt') { const c = child(k, 'sdtContent'); if (c) collectRuns(c) }
      }
    }
    collectRuns(p)
    // Omitted before numbering is assigned, so later clause numbers close up.
    const rawText = runs.map(r => r.text).join('')
    if (this.omit.some(re => re.test(rawText))) return []

    let label: Run | undefined
    let indLeft = pp.indLeft, hanging = pp.hanging
    if (pp.numId && pp.numId !== '0') {
      const ilvl = pp.ilvl ?? 0
      const lvl = this.m.levelFor(pp.numId, ilvl)
      const text = this.m.nextLabel(pp.numId, ilvl)
      if (text) {
        label = { ...this.runStyle(baseR, {}), text }
        if (runs[0]) label = { ...label, bold: runs[0].bold, color: runs[0].color }
      }
      const direct = readPPr(pPr)
      if (direct.indLeft === undefined && lvl?.indLeft !== undefined) indLeft = lvl.indLeft
      if (direct.hanging === undefined && lvl?.hanging !== undefined) hanging = lvl.hanging
    }

    const size = runs.length ? Math.max(...runs.map(r => r.size)) : this.runStyle(baseR, {}).size
    const lineMul = pp.line ? pp.line / 240 : 1
    const para: Para = {
      kind: 'p',
      runs: this.replaceTags(runs).flatMap(splitTicks),
      align: pp.jc === 'center' ? 'center' : pp.jc === 'right' || pp.jc === 'end' ? 'right' : pp.jc === 'both' || pp.jc === 'distribute' ? 'justify' : 'left',
      indLeft: Math.max(twipX(indLeft), -18), indRight: Math.max(twipX(pp.indRight), 0),
      hanging: twipX(hanging), firstLine: twipX(pp.firstLine),
      before: twipY(pp.before), after: twipY(pp.after),
      lineGap: size * 0.18 + size * (lineMul - 1),
      size, label, shade: pp.shade, boxes, pageBreakAfter, pageBreakBefore,
    }
    return [para]
  }

  runStyle(base: RProps, direct: RProps): Omit<Run, 'text'> {
    const r = { ...base, ...direct }
    return {
      bold: !!r.b, italic: !!r.i, underline: !!r.u,
      color: r.color && r.color.toUpperCase() !== '#000000' ? r.color : BLACK,
      size: Math.round(((r.sz || 22) / 2) * FONT_SCALE * 10) / 10,
    }
  }

  run(r: El, baseR: RProps, runs: Run[], boxes: Box[], onPageBreak: () => void) {
    const rPr = child(r, 'rPr')
    const rStyle = wattr(child(rPr, 'rStyle'), 'val')
    let charStyle: RProps = {}
    for (const s of this.m.styleChain(rStyle || undefined)) charStyle = { ...charStyle, ...s.r }
    const direct = { ...charStyle, ...readRPr(rPr) }
    if (direct.vanish) return
    const style = this.runStyle(baseR, direct)
    const push = (text: string) => {
      if (!text) return
      const t = cleanText(direct.caps ? text.toUpperCase() : text)
      if (t) runs.push({ ...style, text: t })
    }
    for (const k of kids(r)) {
      switch (k.localName) {
        case 't': push(k.textContent || ''); break
        case 'tab': push(' '); break
        case 'noBreakHyphen': push('-'); break
        case 'br': if (wattr(k, 'type') === 'page') onPageBreak(); else push('\n'); break
        case 'cr': push('\n'); break
        case 'sym': {
          const c = (wattr(k, 'char') || '').toUpperCase()
          push(c === 'F0FC' || c === 'F0FE' ? '✓' : c === 'F0B7' || c === 'F0A7' ? '•' : '')
          break
        }
        case 'drawing': this.drawing(k, boxes); break
        case 'AlternateContent': {
          const choice = child(k, 'Choice')
          if (choice) for (const d of descendants(choice, 'drawing', ['txbxContent'])) this.drawing(d, boxes)
          break
        }
      }
    }
  }

  drawing(d: El, boxes: Box[]) {
    const holder = kids(d).find(k => k.localName === 'anchor' || k.localName === 'inline')
    if (!holder) return
    const ext = child(holder, 'extent')
    const cx = parseInt(ext?.getAttribute('cx') || '0', 10) * EMU_PT
    for (const tx of descendants(holder, 'txbxContent', ['txbxContent'])) {
      const shape = findAncestor(tx, 'wsp')
      const spPr = shape ? child(shape, 'spPr') : undefined
      const blocks = this.blocks(tx)
      if (!blocks.some(hasContent)) continue
      boxes.push({ fill: shapeFill(spPr, this.m.theme), border: lineColour(spPr, this.m.theme), widthRatio: Math.min(1, cx / 546), blocks })
    }
  }

  table(t: El): Table {
    const grid = child(t, 'tblGrid')
    const cols = grid ? kids(grid).filter(g => g.localName === 'gridCol').map(g => parseInt(wattr(g, 'w') || '0', 10)) : []
    const tblPr = child(t, 'tblPr')
    const tb = child(tblPr, 'tblBorders')
    let borders = !!tb && kids(tb).some(b => !['nil', 'none', ''].includes(wattr(b, 'val')))
    const rows: Cell[][] = []
    for (const tr of kids(t).filter(k => k.localName === 'tr')) {
      const row: Cell[] = []
      for (const tc of kids(tr).filter(k => k.localName === 'tc')) {
        const tcPr = child(tc, 'tcPr')
        const span = parseInt(wattr(child(tcPr, 'gridSpan'), 'val') || '1', 10)
        const vm = child(tcPr, 'vMerge')
        const shd = child(tcPr, 'shd'); const fill = shd ? wattr(shd, 'fill') : ''
        const tcb = child(tcPr, 'tcBorders')
        if (tcb && kids(tcb).some(b => !['nil', 'none', ''].includes(wattr(b, 'val')))) borders = true
        row.push({
          span, skip: !!vm && wattr(vm, 'val') !== 'restart',
          fill: fill && fill !== 'auto' && fill.toUpperCase() !== 'FFFFFF' ? '#' + fill : undefined,
          blocks: this.blocks(tc),
        })
      }
      rows.push(row)
    }
    return { kind: 'table', cols, rows, borders }
  }

  /** Swap a literal sentence for new text (which may contain [[tags]] and **bold** parts), across however many
   *  runs it spans. The replacement takes the style of the first run it overlaps. Used to adapt template wording per tenancy
   *  without editing the Word file. */
  applyRewrites(runs: Run[]): Run[] {
    let out = runs
    for (const { find, replace } of this.rewrites) {
      const joined = out.map(r => r.text).join('')
      const start = joined.indexOf(find)
      if (start < 0) continue
      const end = start + find.length
      const next: Run[] = []
      let pos = 0, inserted = false
      for (const r of out) {
        const a = pos, b = pos + r.text.length
        pos = b
        if (b <= start || a >= end) { next.push(r); continue }
        const pre = r.text.slice(0, Math.max(0, start - a))
        const post = r.text.slice(Math.min(r.text.length, end - a))
        if (pre) next.push({ ...r, text: pre })
        // **text** in the replacement is drawn bold (matching how the template bolds its filled-in figures)
        if (!inserted) {
          replace.split(/(\*\*[^*]+\*\*)/).filter(Boolean).forEach(part => {
            const bold = part.startsWith('**') && part.endsWith('**')
            next.push({ ...r, text: bold ? part.slice(2, -2) : part, bold: bold || r.bold })
          })
          inserted = true
        }
        if (post) next.push({ ...r, text: post })
      }
      out = next
    }
    return out
  }

  replaceTags(runs: Run[]): Run[] {
    let out = this.applyRewrites(runs.map(r => ({ ...r })))
    const re = /\[\[\s*([A-Za-z]+\.[A-Za-z]+)\s*\]\]/
    for (let guard = 0; guard < 200; guard++) {
      const joined = out.map(r => r.text).join('')
      const m = re.exec(joined)
      if (!m) break
      const start = m.index, end = start + m[0].length
      const value = this.values[m[1]] ?? ''
      const next: Run[] = []
      let pos = 0, inserted = false
      for (const r of out) {
        const a = pos, b = pos + r.text.length
        pos = b
        if (b <= start || a >= end) { next.push(r); continue }
        const pre = r.text.slice(0, Math.max(0, start - a))
        const post = r.text.slice(Math.min(r.text.length, end - a))
        if (pre) next.push({ ...r, text: pre })
        if (!inserted) { if (value) next.push({ ...r, text: value }); inserted = true }
        if (post) next.push({ ...r, text: post })
      }
      out = next
    }
    return out.filter(r => r.text !== '')
  }
}

function findAncestor(el: El, name: string): El | undefined {
  let n = el.parentNode as El | null
  while (n && n.nodeType === 1) { if (n.localName === name) return n; n = n.parentNode as El | null }
  return undefined
}

const SCHEME_ALIAS: Record<string, string> = { bg1: 'lt1', tx1: 'dk1', bg2: 'lt2', tx2: 'dk2' }

function drawingColour(holder: El | undefined, theme: Record<string, string>): string | undefined {
  if (!holder) return undefined
  const srgb = child(holder, 'srgbClr')
  const scheme = child(holder, 'schemeClr')
  const node = srgb || scheme
  if (!node) return undefined
  let hex = srgb ? (srgb.getAttribute('val') || '') : theme[SCHEME_ALIAS[scheme!.getAttribute('val') || ''] || scheme!.getAttribute('val') || '']
  if (!hex) return undefined
  const lumMod = child(node, 'lumMod'), lumOff = child(node, 'lumOff')
  if (lumMod || lumOff) hex = adjustLum(hex, lumMod ? +lumMod.getAttribute('val')! / 100000 : 1, lumOff ? +lumOff.getAttribute('val')! / 100000 : 0)
  return '#' + hex.toUpperCase()
}

function adjustLum(hex: string, mod: number, off: number): string {
  const [r, g, b] = [0, 2, 4].map(i => parseInt(hex.slice(i, i + 2), 16) / 255)
  const max = Math.max(r, g, b), min = Math.min(r, g, b)
  let h = 0, s2 = 0
  const l = (max + min) / 2
  if (max !== min) {
    const d = max - min
    s2 = l > 0.5 ? d / (2 - max - min) : d / (max + min)
    h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4
    h /= 6
  }
  const L = Math.min(1, Math.max(0, l * mod + off))
  const q = L < 0.5 ? L * (1 + s2) : L + s2 - L * s2, p2 = 2 * L - q
  const f = (t: number) => { t = (t + 1) % 1; return t < 1 / 6 ? p2 + (q - p2) * 6 * t : t < 1 / 2 ? q : t < 2 / 3 ? p2 + (q - p2) * (2 / 3 - t) * 6 : p2 }
  const out = s2 === 0 ? [L, L, L] : [f(h + 1 / 3), f(h), f(h - 1 / 3)]
  return out.map(v => Math.round(v * 255).toString(16).padStart(2, '0')).join('')
}

function shapeFill(spPr: El | undefined, theme: Record<string, string>): string | undefined {
  const c = drawingColour(spPr ? child(spPr, 'solidFill') : undefined, theme)
  return c && c !== '#FFFFFF' ? c : undefined
}

function lineColour(spPr: El | undefined, theme: Record<string, string>): string | undefined {
  const ln = spPr ? child(spPr, 'ln') : undefined
  if (!ln || child(ln, 'noFill')) return undefined
  return drawingColour(child(ln, 'solidFill'), theme) ?? (child(ln, 'solidFill') ? '#BFBFBF' : undefined)
}

const paraText = (p: Para) => p.runs.map(r => r.text).join('')
function hasContent(b: Block): boolean {
  if (b.kind === 'p') return paraText(b).trim() !== '' || b.boxes.length > 0
  return true
}

// ── Post-processing: bills, spacing, page breaks ─────────────────────────────

function deepTexts(bs: Block[]): string[] {
  return bs.flatMap(b => b.kind === 'p' ? [paraText(b), ...b.boxes.flatMap(x => deepTexts(x.blocks))]
    : b.kind === 'table' ? b.rows.flatMap(r => r.flatMap(c => deepTexts(c.blocks))) : [])
}

function isBillsBox(b: Box): boolean {
  const texts = deepTexts(b.blocks).map(t => t.trim()).filter(Boolean)
  return texts.length >= 5 && texts.every(t => t === LANDLORD_TEXT || t === TENANT_TEXT)
}

function normalise(blocks: Block[]): Block[] {
  const out: Block[] = []
  let dropBillLabels = false
  let emptyRun = 0
  let recentBoxTexts: string[] = []
  let sinceBox = 99
  const flushEmpty = () => {
    if (emptyRun >= 4) out.push({ kind: 'pagebreak' })
    else if (emptyRun > 0) out.push(blankPara())
    emptyRun = 0
  }
  for (const b of blocks) {
    if (b.kind === 'p') {
      if (b.boxes.some(isBillsBox)) {
        flushEmpty()
        b.boxes = b.boxes.filter(x => !isBillsBox(x))
        out.push({ kind: 'bills' })
        dropBillLabels = true
        if (BILL_LABEL_RE.test(paraText(b).trim())) continue
      }
      if (dropBillLabels && BILL_LABEL_RE.test(paraText(b).trim())) continue
      // In Word the text box sits over this paragraph, hiding it; in a flowing PDF it would repeat.
      sinceBox++
      if (sinceBox <= 3 && paraText(b).trim() && recentBoxTexts.includes(paraText(b).trim()) && !b.boxes.length) continue
      if (b.boxes.length) { recentBoxTexts = b.boxes.flatMap(x => deepTexts(x.blocks)).map(t => t.trim()).filter(Boolean); sinceBox = 0 }
      if (paraText(b).trim()) dropBillLabels = false
      if (b.pageBreakBefore) { emptyRun = 0; out.push({ kind: 'pagebreak' }) }
      if (!hasContent(b)) {
        if (b.pageBreakAfter) { emptyRun = 0; out.push({ kind: 'pagebreak' }) } else emptyRun++
        continue
      }
      flushEmpty()
      out.push(b)
      if (b.pageBreakAfter) out.push({ kind: 'pagebreak' })
    } else {
      flushEmpty()
      out.push(b)
    }
  }
  flushEmpty()
  return out
}

function blankPara(): Para {
  return { kind: 'p', runs: [], align: 'left', indLeft: 0, indRight: 0, hanging: 0, firstLine: 0, before: 0, after: 0, lineGap: 0, size: BODY_PT, boxes: [], pageBreakAfter: false, pageBreakBefore: false }
}

// ── Rendering ────────────────────────────────────────────────────────────────
// Lines are laid out by hand (word by word) rather than via pdfkit's text flow:
// pdfkit misplaces mixed-style runs on centred/justified lines, and its automatic
// page breaks can't be coordinated with the letterhead.

export interface RenderOptions {
  values: Record<string, string>
  bills: BillsConfig
  title: string
  biz: PDFBizSettings
  omitParagraphs?: RegExp[]
  /** Literal sentences to replace before tags are filled (see Parser.applyRewrites) */
  rewrites?: Rewrite[]
}

export interface Rewrite { find: string; replace: string }

interface Tok { text: string; run: Run; width: number; space: boolean; br: boolean }
interface Line { toks: Tok[]; width: number; height: number; size: number; avail: number; offset: number; last: boolean }

const LINE_FACTOR = 1.22

export async function renderTenancyAgreementPdf(template: Buffer, opts: RenderOptions): Promise<Buffer> {
  const zip = await JSZip.loadAsync(template)
  const docXml = await zip.file('word/document.xml')!.async('string')
  const model = new DocxModel(
    (await zip.file('word/styles.xml')?.async('string')) ?? null,
    (await zip.file('word/numbering.xml')?.async('string')) ?? null,
    (await zip.file('word/theme/theme1.xml')?.async('string')) ?? null,
  )
  const dom = new DOMParser().parseFromString(docXml, 'text/xml')
  const body = dom.getElementsByTagNameNS(W_NS, 'body')[0] as unknown as El
  const blocks = normalise(new Parser(model, opts.values, opts.omitParagraphs, opts.rewrites).blocks(body))

  const assets = loadPDFLetterheadAssets()
  const fontsDir = path.join(process.cwd(), 'public', 'fonts')
  const FONT = {
    reg: assets.fontReg, bold: assets.fontBold,
    italic: assets.fontReg === 'Helvetica' ? 'Helvetica-Oblique' : path.join(fontsDir, 'Lato-Italic.ttf'),
    boldItalic: assets.fontBold === 'Helvetica-Bold' ? 'Helvetica-BoldOblique' : path.join(fontsDir, 'Lato-BoldItalic.ttf'),
  }
  const fontFor = (r: { bold: boolean; italic: boolean }) =>
    r.bold && r.italic ? FONT.boldItalic : r.bold ? FONT.bold : r.italic ? FONT.italic : FONT.reg

  // Bottom margin 0: every page break is decided here, never by pdfkit.
  const doc = new PDFDocument({
    size: 'A4',
    margins: { top: CONTENT_TOP, bottom: 0, left: MARGIN, right: MARGIN },
    info: { Title: opts.title, Author: 'Capital Rooms' },
    bufferPages: true,   // so "Page X of Y" can be added once the page count is known
  })
  const chunks: Buffer[] = []
  doc.on('data', (c: Buffer) => chunks.push(c))
  const done = new Promise<Buffer>((resolve, reject) => {
    doc.on('end', () => resolve(Buffer.concat(chunks)))
    doc.on('error', reject)
  })

  // Open each image once so it is embedded once, not per page.
  const once = (buf: Buffer) => (buf.length ? Object.assign(doc.openImage(buf), { length: buf.length }) : buf)
  const logo = once(assets.logoImg)
  const footer = once(assets.footerImg) as unknown as Buffer

  const decorate = () => {
    if (assets.logoImg.length) doc.image(logo as never, PAGE_W - MARGIN - LOGO_W, MARGIN, { width: LOGO_W, height: LOGO_H })
    drawPDFFooter(doc, footer, opts.biz, FONT.reg)
  }
  decorate()

  let y = CONTENT_TOP
  const newPage = () => { doc.addPage(); decorate(); y = CONTENT_TOP }
  const ensure = (h: number) => { if (y + h > CONTENT_BOTTOM && y > CONTENT_TOP + 1) newPage() }

  const widthOf = (text: string, r: Run) => {
    if (r.tick) return r.size * 1.05
    doc.font(fontFor(r)).fontSize(r.size)
    return doc.widthOfString(text)
  }

  function drawTick(kind: string, x: number, top: number, size: number, colour: string) {
    const s = size * 0.8
    const bx = x + size * 0.05, by = top + size * 0.12
    if (kind === 'badge') {
      doc.save().roundedRect(bx, by, s, s, s * 0.22).fill('#2E9E4F').restore()
      doc.save().lineWidth(s * 0.14).lineCap('round').lineJoin('round')
        .moveTo(bx + s * 0.24, by + s * 0.52).lineTo(bx + s * 0.43, by + s * 0.72).lineTo(bx + s * 0.78, by + s * 0.3).stroke('#FFFFFF').restore()
    } else {
      doc.save().lineWidth(s * 0.13).lineCap('round').lineJoin('round')
        .moveTo(bx + s * 0.1, by + s * 0.55).lineTo(bx + s * 0.38, by + s * 0.85).lineTo(bx + s * 0.9, by + s * 0.15).stroke(colour).restore()
    }
  }

  function tokenize(runs: Run[]): Tok[] {
    const out: Tok[] = []
    for (const r of runs) {
      for (const part of r.text.split(/(\n|[ \t ]+)/)) {
        if (!part) continue
        if (part === '\n') out.push({ text: '', run: r, width: 0, space: false, br: true })
        else if (/^[ \t ]+$/.test(part)) out.push({ text: ' ', run: r, width: widthOf(' ', r) * Math.min(part.length, 4), space: true, br: false })
        else out.push({ text: part, run: r, width: widthOf(part, r), space: false, br: false })
      }
    }
    return out
  }

  const layoutCache = new Map<Para, Map<number, Line[]>>()
  function layout(p: Para, width: number): Line[] {
    const cached = layoutCache.get(p)?.get(width)
    if (cached) return cached
    const textW = Math.max(40, width - p.indLeft - p.indRight)
    const labelW = p.label ? widthOf(p.label.text, p.label) + 5 : 0
    const firstOffset = p.label ? Math.max(0, labelW - p.hanging) : p.firstLine > 0 ? p.firstLine : 0
    const lines: Line[] = []
    const lineHeight = (size: number) => size * LINE_FACTOR + p.lineGap
    let cur: Line = { toks: [], width: 0, height: 0, size: 0, avail: textW - firstOffset, offset: firstOffset, last: false }
    const finish = (last: boolean) => {
      while (cur.toks.length && cur.toks[cur.toks.length - 1].space) cur.width -= cur.toks.pop()!.width
      cur.size = cur.toks.reduce((m, t) => Math.max(m, t.run.size), 0) || p.size
      cur.height = lineHeight(cur.size)
      cur.last = last
      lines.push(cur)
      cur = { toks: [], width: 0, height: 0, size: 0, avail: textW, offset: 0, last: false }
    }
    for (const t of tokenize(p.runs)) {
      if (t.br) { finish(true); continue }
      if (t.space) { if (cur.toks.length) { cur.toks.push(t); cur.width += t.width }; continue }
      if (cur.width + t.width > cur.avail && cur.toks.some(x => !x.space)) finish(false)
      if (t.width > cur.avail) {
        // Over-long word (e.g. an email address): break by characters.
        let chunk = ''
        for (const ch of t.text) {
          const w = widthOf(chunk + ch, t.run)
          if (w > cur.avail - cur.width && chunk) {
            cur.toks.push({ ...t, text: chunk, width: widthOf(chunk, t.run) }); finish(false); chunk = ch
          } else chunk += ch
        }
        if (chunk) { const w = widthOf(chunk, t.run); cur.toks.push({ ...t, text: chunk, width: w }); cur.width += w }
        continue
      }
      cur.toks.push(t); cur.width += t.width
    }
    finish(true)
    if (!layoutCache.has(p)) layoutCache.set(p, new Map())
    layoutCache.get(p)!.set(width, lines)
    return lines
  }

  const measurePara = (p: Para, width: number): number =>
    !paraText(p).trim() ? p.before + p.size * 0.95 + p.after
      : p.before + layout(p, width).reduce((s, l) => s + l.height, 0) + p.after

  const boxWidth = (bx: Box, width: number) => (bx.widthRatio > 0.6 ? width : Math.max(width * bx.widthRatio, 140))
  const measureBox = (bx: Box, width: number) => measureBlocks(bx.blocks.filter(hasContent), boxWidth(bx, width) - 16) + 10 + 6
  function measureBlocks(bs: Block[], width: number): number {
    return bs.reduce((sum, b) => sum + (
      b.kind === 'p' ? measurePara(b, width) + b.boxes.reduce((s, bx) => s + measureBox(bx, width), 0)
      : b.kind === 'table' ? measureTable(b, width)
      : b.kind === 'bills' ? BILL_ROWS.length * 17 + 8 : 0), 0)
  }

  function drawLine(l: Line, p: Para, x: number, top: number, width: number) {
    const textX = x + p.indLeft + l.offset
    const extra = Math.max(0, l.avail - l.width)
    let cx = textX
    let spaceBonus = 0
    if (p.align === 'center') cx += extra / 2
    else if (p.align === 'right') cx += extra
    else if (p.align === 'justify' && !l.last) {
      const gaps = l.toks.filter((t, i) => t.space && i > 0 && i < l.toks.length - 1).length
      if (gaps && extra / gaps < 12) spaceBonus = extra / gaps
    }
    for (const t of l.toks) {
      const w = t.width + (t.space ? spaceBonus : 0)
      if (!t.space) {
        const ty = top + (l.size - t.run.size) * 0.8
        if (t.run.tick) drawTick(t.text, cx, ty, t.run.size, t.run.color)
        else doc.font(fontFor(t.run)).fontSize(t.run.size).fillColor(t.run.color).text(t.text, cx, ty, { lineBreak: false })
      }
      if (t.run.underline && !t.run.tick) {
        const uy = top + l.size * 1.02
        doc.save().lineWidth(0.5).moveTo(cx, uy).lineTo(cx + w, uy).stroke(t.run.color).restore()
      }
      cx += w
    }
  }

  function drawPara(p: Para, x: number, width: number, flow: boolean) {
    if (!paraText(p).trim()) { y += measurePara(p, width); return }
    const lines = layout(p, width)
    if (flow) {
      const heading = p.runs.every(r => r.bold || !r.text.trim()) && paraText(p).length < 90
      // keep headings with what follows; avoid a lone first line at the foot of a page
      ensure(p.before + (heading ? lines[0].height * lines.length + 30 : lines[0].height * Math.min(2, lines.length)))
    }
    y += p.before
    if (p.shade) {
      const h = lines.reduce((s, l) => s + l.height, 0)
      doc.save().rect(x - 4, y - 2, width + 8, h + 4).fill(p.shade).restore()
    }
    lines.forEach((l, i) => {
      if (flow && y + l.height > CONTENT_BOTTOM) newPage()
      if (i === 0 && p.label) {
        const lx = Math.max(x - 18, x + p.indLeft - p.hanging)
        doc.font(fontFor(p.label)).fontSize(p.label.size).fillColor(p.label.color).text(p.label.text, lx, y, { lineBreak: false })
      }
      drawLine(l, p, x, y, width)
      y += l.height
    })
    y += p.after
  }

  function drawBox(bx: Box, x: number, width: number) {
    const inner = bx.blocks.filter(hasContent)
    const w = boxWidth(bx, width)
    const bxX = x + (width - w) / 2
    const h = measureBox(bx, width) - 6
    if (y + h + 6 > CONTENT_BOTTOM) newPage()
    y += 3
    if (bx.fill || bx.border) {
      doc.save().rect(bxX, y, w, h)
      if (bx.fill && bx.border) doc.lineWidth(0.5).fillAndStroke(bx.fill, bx.border)
      else if (bx.fill) doc.fill(bx.fill)
      else doc.lineWidth(0.5).stroke(bx.border!)
      doc.restore()
    }
    const top = y
    y += 5
    drawBlocks(inner, bxX + 8, w - 16, false)
    y = Math.max(y + 5, top + h) + 3
  }

  function colWidths(t: Table, width: number): number[] {
    const total = t.cols.reduce((a, b) => a + b, 0) || 1
    return t.cols.map(c => (c / total) * width)
  }
  function cellWidth(row: Cell[], idx: number, widths: number[]): number {
    let start = 0
    for (let i = 0; i < idx; i++) start += row[i].span
    return widths.slice(start, start + row[idx].span).reduce((a, b) => a + b, 0) || widths[widths.length - 1] || 100
  }
  function rowHeight(row: Cell[], widths: number[]): number {
    return Math.max(15, ...row.map((c, i) => (c.skip ? 0 : measureBlocks(c.blocks.filter(hasContent), cellWidth(row, i, widths) - 10) + 8)))
  }
  function measureTable(t: Table, width: number): number {
    const widths = colWidths(t, width)
    return t.rows.reduce((s, row) => s + rowHeight(row, widths), 0) + 4
  }

  function drawTable(t: Table, x: number, width: number) {
    const widths = colWidths(t, width)
    for (const row of t.rows) {
      const rh = rowHeight(row, widths)
      if (y + rh > CONTENT_BOTTOM) newPage()
      let cx = x
      row.forEach((c, i) => {
        const cw = cellWidth(row, i, widths)
        if (c.fill) doc.save().rect(cx, y, cw, rh).fill(c.fill).restore()
        if (t.borders) doc.save().lineWidth(0.5).rect(cx, y, cw, rh).stroke('#D9D9D9').restore()
        const inner = c.blocks.filter(hasContent)
        if (!c.skip && inner.length) {
          const top = y
          y += 4
          drawBlocks(inner, cx + 5, cw - 10, false)
          y = top
        }
        cx += cw
      })
      y += rh
    }
    y += 4
  }

  function drawBills(x: number, width: number) {
    const labelW = 150, rowH = 17
    ensure(rowH * BILL_ROWS.length + 8)
    for (const [key, label] of BILL_ROWS) {
      doc.font(FONT.reg).fontSize(BODY_PT).fillColor(BLACK).text(label, x, y + 4, { lineBreak: false })
      doc.save().lineWidth(0.5).rect(x + labelW, y, width - labelW, rowH).fillAndStroke('#F2F2F2', '#BFBFBF').restore()
      doc.font(FONT.reg).fontSize(BODY_PT).fillColor(BLACK)
        .text(opts.bills[key] === 'landlord' ? LANDLORD_TEXT : TENANT_TEXT, x + labelW + 6, y + 4, { lineBreak: false })
      y += rowH
    }
    y += 8
  }

  const isTitle = (b: Block | undefined) =>
    !!b && b.kind === 'p' && b.align === 'center' && b.runs.length > 0 && b.runs.every(r => r.bold || !r.text.trim())

  const PAGE_CAPACITY = CONTENT_BOTTOM - CONTENT_TOP

  function drawBlocks(bs: Block[], x: number, width: number, flow: boolean) {
    bs.forEach((b, i) => {
      // Keep a heading and the table/box that follows it on one page when they fit on a page.
      if (flow && b.kind === 'p' && paraText(b).trim() && !b.boxes.length) {
        const next = bs.slice(i + 1).find(hasContent)
        const nextH = next?.kind === 'table' ? measureTable(next, width) : 0
        const h = measurePara(b, width) + nextH
        if (nextH && h < PAGE_CAPACITY && y + h > CONTENT_BOTTOM) newPage()
      }
      if (flow && b.kind === 'table') {
        const h = measureTable(b, width)
        if (h < PAGE_CAPACITY && y + h > CONTENT_BOTTOM) newPage()
      }
      if (b.kind === 'pagebreak') {
        // Honour the template's page breaks, except where they'd leave a near-empty page.
        if (flow && y > CONTENT_TOP + 1) {
          if (isTitle(bs.slice(i + 1).find(hasContent))) newPage()
          else y += BODY_PT
        }
        return
      }
      if (b.kind === 'bills') { drawBills(x, width); return }
      if (b.kind === 'table') { drawTable(b, x, width); return }
      if (flow && y <= CONTENT_TOP + 1 && !paraText(b).trim() && !b.boxes.length) return
      drawPara(b, x, width, flow)
      for (const bx of b.boxes) drawBox(bx, x, width)
    })
  }

  drawBlocks(blocks, MARGIN, COL_W, true)
  // Page numbers, just above the footer band: "Page 3 of 22"
  const range = doc.bufferedPageRange()
  for (let i = range.start; i < range.start + range.count; i++) {
    doc.switchToPage(i)
    doc.font(FONT.reg).fontSize(8).fillColor('#78716c')
      .text(`Page ${i - range.start + 1} of ${range.count}`, MARGIN, PAGE_H - FOOTER_BAND_H - 12, { width: PAGE_W - 2 * MARGIN, align: 'right', lineBreak: false })
  }
  doc.end()
  return done
}
