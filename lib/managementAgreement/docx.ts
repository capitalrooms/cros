// The management / rent collection agreement as an editable Word file (.docx) — for a landlord who wants to suggest
// changes. Built from the very blocks the PDF draws (blocks.ts), so the wording is identical; the letterhead logo
// sits top right on every page and the accreditation strip along the bottom, as on the PDF.
// A .docx is a zip of XML parts; this writes the few it needs with jszip (no extra dependency).
import JSZip from 'jszip'
import { generateManagementAgreementPDF, type ManagementAgreementData } from '@/lib/managementAgreement/generatePDF'
import { loadPDFLetterheadAssets, LOGO_W, LOGO_H } from '@/lib/pdfLetterhead'
import type { AgreementBlock } from '@/lib/managementAgreement/blocks'

const FONT = 'Arial'
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
const EMU = 12700   // per point

function run(text: string, o: { bold?: boolean; size?: number; colour?: string; caps?: boolean } = {}) {
  const props = [
    `<w:rFonts w:ascii="${FONT}" w:hAnsi="${FONT}" w:cs="${FONT}"/>`,
    o.bold ? '<w:b/>' : '', o.colour ? `<w:color w:val="${o.colour}"/>` : '',
    `<w:sz w:val="${Math.round((o.size ?? 10) * 2)}"/>`,
  ].join('')
  // keep line breaks the text carries (addresses)
  return text.split('\n').map((part, i) => `${i ? '<w:r><w:br/></w:r>' : ''}<w:r><w:rPr>${props}</w:rPr><w:t xml:space="preserve">${esc(part)}</w:t></w:r>`).join('')
}

function para(content: string, o: { align?: 'left' | 'both' | 'right' | 'center'; before?: number; after?: number; indent?: number; keepNext?: boolean; numbered?: boolean; border?: boolean } = {}) {
  const ppr = [
    o.keepNext ? '<w:keepNext/>' : '',
    o.numbered ? '<w:numPr><w:ilvl w:val="0"/><w:numId w:val="1"/></w:numPr>' : '',
    o.border ? '<w:pBdr><w:bottom w:val="single" w:sz="4" w:space="6" w:color="C0C0C0"/></w:pBdr>' : '',
    `<w:spacing w:before="${o.before ?? 0}" w:after="${o.after ?? 160}" w:line="276" w:lineRule="auto"/>`,
    o.indent ? `<w:ind w:left="${o.indent}"/>` : '',
    `<w:jc w:val="${o.align ?? 'both'}"/>`,
  ].join('')
  return `<w:p><w:pPr>${ppr}</w:pPr>${content}</w:p>`
}

function cell(content: string, width: number, o: { fill?: string; borders?: boolean } = {}) {
  const b = o.borders === false ? '<w:tcBorders><w:top w:val="nil"/><w:left w:val="nil"/><w:bottom w:val="nil"/><w:right w:val="nil"/></w:tcBorders>' : ''
  return `<w:tc><w:tcPr><w:tcW w:w="${width}" w:type="dxa"/>${b}${o.fill ? `<w:shd w:val="clear" w:color="auto" w:fill="${o.fill}"/>` : ''}<w:tcMar><w:top w:w="80" w:type="dxa"/><w:bottom w:w="80" w:type="dxa"/></w:tcMar></w:tcPr>${content}</w:tc>`
}

const TEXT_W = 9638   // A4 width less 2cm margins, in twentieths of a point

function body(blocks: AgreementBlock[]) {
  const out: string[] = []
  for (const b of blocks) {
    if (b.kind === 'title') {
      out.push(para(run(b.text, { bold: true, size: 16 }), { align: 'left', after: 60 }))
      out.push(para(run(b.sub, { size: 10.5, colour: '666666' }), { align: 'left', after: 60 }))
      out.push(para(run(b.date, { size: 9.5, colour: '666666' }), { align: 'left', after: 240, border: true }))
    } else if (b.kind === 'label') {
      out.push(para(run(b.text, { bold: true, size: 11 }), { align: 'left', before: 240, after: 120, keepNext: true }))
    } else if (b.kind === 'para') {
      out.push(para(run(b.text, { bold: b.bold, size: b.small ? 8 : 10, colour: b.muted ? '888888' : undefined }), { indent: b.indent ? 360 : 0 }))
    } else if (b.kind === 'clause') {
      out.push(para(run(`${b.num}.  ${b.title}`, { bold: true }), { align: 'left', before: 120, after: 80, keepNext: true }))
      out.push(para(run(b.text), { indent: 360 }))
    } else if (b.kind === 'bullets') {
      for (const item of b.items) out.push(para(run(item), { numbered: true, after: 80 }))
    } else if (b.kind === 'table') {
      const w1 = Math.round(TEXT_W * 0.4), w2 = TEXT_W - w1
      const head = `<w:tr><w:trPr><w:tblHeader/></w:trPr>${cell(para(run(b.head[0], { bold: true, size: 9, colour: 'FFFFFF' }), { align: 'left', after: 0 }), w1, { fill: '000000' })}${cell(para(run(b.head[1], { bold: true, size: 9, colour: 'FFFFFF' }), { align: 'left', after: 0 }), w2, { fill: '000000' })}</w:tr>`
      const rows = b.rows.map((r, i) => `<w:tr><w:trPr><w:cantSplit/></w:trPr>${cell(para(run(r[0], { size: 9 }), { align: 'left', after: 0 }), w1, { fill: i % 2 ? 'F8F8F8' : undefined })}${cell(para(run(r[1], { size: 9 }), { align: 'left', after: 0 }), w2, { fill: i % 2 ? 'F8F8F8' : undefined })}</w:tr>`).join('')
      out.push(`<w:tbl><w:tblPr><w:tblW w:w="${TEXT_W}" w:type="dxa"/><w:tblBorders><w:insideH w:val="single" w:sz="4" w:color="ECECEC"/><w:bottom w:val="single" w:sz="4" w:color="ECECEC"/></w:tblBorders><w:tblLayout w:type="fixed"/><w:tblCellMar><w:left w:w="100" w:type="dxa"/><w:right w:w="100" w:type="dxa"/></w:tblCellMar></w:tblPr><w:tblGrid><w:gridCol w:w="${w1}"/><w:gridCol w:w="${w2}"/></w:tblGrid>${head}${rows}</w:tbl>`)
      out.push(para('', { after: 120 }))
    } else if (b.kind === 'signatures') {
      const half = Math.round(TEXT_W / 2)
      const line = (label: string, name?: string | null) => para(run(name ?? ' ', { size: 10 }), { align: 'left', before: 360, after: 0, border: true }) + para(run(label, { size: 8, colour: '666666' }), { align: 'left', after: 60 })
      const col = (head: string, role: string, name?: string | null) => para(run(head, { bold: true, size: 9 }), { align: 'left', after: 60 }) + line(role) + line('Date') + line('Print name', name)
      out.push(`<w:tbl><w:tblPr><w:tblW w:w="${TEXT_W}" w:type="dxa"/><w:tblLayout w:type="fixed"/><w:tblCellMar><w:left w:w="0" w:type="dxa"/><w:right w:w="240" w:type="dxa"/></w:tblCellMar></w:tblPr><w:tblGrid><w:gridCol w:w="${half}"/><w:gridCol w:w="${TEXT_W - half}"/></w:tblGrid><w:tr><w:trPr><w:cantSplit/></w:trPr>${cell(col(b.left, 'Authorised signatory'), half, { borders: false })}${cell(col(b.right, b.rightRole, b.rightName), TEXT_W - half, { borders: false })}</w:tr></w:tbl>`)
      out.push(para('', { after: 120 }))
    }
  }
  return out.join('')
}

/** PNG width and height in pixels (from its header), to keep the images' proportions. */
function pngSize(png: Buffer): { w: number; h: number } | null {
  return png.length > 24 && png.readUInt32BE(12) === 0x49484452 ? { w: png.readUInt32BE(16), h: png.readUInt32BE(20) } : null
}

function drawing(rel: string, id: number, wPt: number, hPt: number, align: 'right' | 'center') {
  const cx = Math.round(wPt * EMU), cy = Math.round(hPt * EMU)
  return para(`<w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="${cx}" cy="${cy}"/><wp:docPr id="${id}" name="Image ${id}"/><a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:nvPicPr><pic:cNvPr id="${id}" name="image${id}.png"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip r:embed="${rel}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r>`, { align, after: 0 })
}

const NS = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"'

export async function generateManagementAgreementDocx(data: ManagementAgreementData): Promise<Buffer> {
  const blocks: AgreementBlock[] = []
  await generateManagementAgreementPDF(data, blocks)   // the PDF itself is discarded; the blocks are what it said
  const { logoImg, footerImg } = loadPDFLetterheadAssets()
  const biz = data.bizSettings
  const zip = new JSZip()

  const hasLogo = logoImg.length > 0, hasFooter = footerImg.length > 0
  const fSize = hasFooter ? pngSize(footerImg) : null
  const footerW = TEXT_W / 20, footerH = fSize ? footerW * fSize.h / fSize.w : 0
  const footerText = biz ? [biz.company_name, [biz.address_line1, biz.city, biz.postcode].filter(Boolean).join(', '), [biz.phone, biz.email].filter(Boolean).join(' · ')].filter(Boolean).join(' · ') : 'Capital Rooms'

  zip.file('[Content_Types].xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Default Extension="png" ContentType="image/png"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/><Override PartName="/word/numbering.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.numbering+xml"/><Override PartName="/word/header1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.header+xml"/><Override PartName="/word/footer1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.footer+xml"/></Types>`)
  zip.file('_rels/.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`)
  zip.file('word/_rels/document.xml.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/numbering" Target="numbering.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/header" Target="header1.xml"/><Relationship Id="rId4" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/footer" Target="footer1.xml"/></Relationships>`)
  zip.file('word/styles.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="${FONT}" w:hAnsi="${FONT}" w:cs="${FONT}"/><w:sz w:val="20"/><w:lang w:val="en-GB"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:after="160"/></w:pPr></w:pPrDefault></w:docDefaults><w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/></w:style></w:styles>`)
  zip.file('word/numbering.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:numbering xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:abstractNum w:abstractNumId="0"><w:multiLevelType w:val="singleLevel"/><w:lvl w:ilvl="0"><w:start w:val="1"/><w:numFmt w:val="bullet"/><w:lvlText w:val="•"/><w:lvlJc w:val="left"/><w:pPr><w:ind w:left="720" w:hanging="360"/></w:pPr><w:rPr><w:rFonts w:ascii="${FONT}" w:hAnsi="${FONT}"/></w:rPr></w:lvl></w:abstractNum><w:num w:numId="1"><w:abstractNumId w:val="0"/></w:num></w:numbering>`)

  zip.file('word/header1.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:hdr ${NS}>${hasLogo ? drawing('rIdLogo', 1, LOGO_W * 0.8, LOGO_H * 0.8, 'right') : para('', { after: 0 })}</w:hdr>`)
  zip.file('word/_rels/header1.xml.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${hasLogo ? '<Relationship Id="rIdLogo" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/logo.png"/>' : ''}</Relationships>`)
  zip.file('word/footer1.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:ftr ${NS}>${para(run(footerText, { size: 7.5, colour: '888888' }), { align: 'center', after: 60 })}${hasFooter && fSize ? drawing('rIdFoot', 2, footerW, footerH, 'center') : ''}</w:ftr>`)
  zip.file('word/_rels/footer1.xml.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${hasFooter ? '<Relationship Id="rIdFoot" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/footer.png"/>' : ''}</Relationships>`)
  if (hasLogo) zip.file('word/media/logo.png', logoImg)
  if (hasFooter) zip.file('word/media/footer.png', footerImg)

  zip.file('word/document.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document ${NS}><w:body>${body(blocks)}<w:sectPr><w:headerReference w:type="default" r:id="rId3"/><w:footerReference w:type="default" r:id="rId4"/><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1418" w:right="1134" w:bottom="1418" w:left="1134" w:header="567" w:footer="340" w:gutter="0"/></w:sectPr></w:body></w:document>`)
  return zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' })
}
