// An advert's description, laid out (12 Nov 2026): "## " lines become headings, "- " lines bullets, the rest
// paragraphs. Old descriptions with no headings show just as they did. Used by the share link and the website.
import React from 'react'

export default function AdvertText({ text, headingClass, headingStyle, bodyStyle }: { text: string; headingClass?: string; headingStyle?: React.CSSProperties; bodyStyle?: React.CSSProperties }) {
  const blocks: React.ReactNode[] = []
  let para: string[] = [], list: string[] = []
  const flush = () => {
    if (para.length) { blocks.push(<p key={blocks.length} style={{ margin: '0 0 14px' }}>{para.join(' ')}</p>); para = [] }
    if (list.length) { blocks.push(<ul key={blocks.length} style={{ margin: '0 0 14px', paddingLeft: 20, listStyle: 'disc' }}>{list.map((x, i) => <li key={i} style={{ margin: '2px 0' }}>{x}</li>)}</ul>); list = [] }
  }
  for (const raw of String(text ?? '').split('\n')) {
    const line = raw.trim()
    if (!line) { flush(); continue }
    const h = line.match(/^#{1,3}\s+(.*)$/)
    if (h) { flush(); blocks.push(<h3 key={blocks.length} className={headingClass} style={{ margin: '22px 0 8px', fontWeight: 700, fontSize: 18, ...headingStyle }}>{h[1]}</h3>); continue }
    const b = line.match(/^[-•*]\s+(.*)$/)
    if (b) { if (para.length) flush(); list.push(b[1]); continue }
    if (list.length) flush()
    para.push(line)
  }
  flush()
  return <div style={{ maxWidth: '65ch', ...bodyStyle }}>{blocks}</div>
}

/** The same text without the layout marks — for search results, link previews and plain emails. */
export const plainAdvert = (text: string) => String(text ?? '').replace(/^#{1,3}\s+/gm, '').replace(/^[-•*]\s+/gm, '• ').replace(/\n{2,}/g, '\n').trim()
