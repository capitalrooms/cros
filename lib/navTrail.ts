// The screens this tab has been through, so every Back goes to the screen you actually came from — and can say its
// name (Harry, 17 Oct 2026: "anywhere on the site if you go into a screen you can always go back to the previous
// screen"). Kept in sessionStorage (one trail per browser tab), recorded by app/components/NavTrail.
//   - a new screen is added on top; going back to the one below removes the top
//   - changing only the query on the same screen (a tab, a filter) replaces the top instead of adding to it
export interface TrailEntry { url: string; path: string; label: string }
const KEY = 'cros-trail'
const MAX = 40

export function readTrail(): TrailEntry[] {
  try { const t = JSON.parse(sessionStorage.getItem(KEY) ?? '[]'); return Array.isArray(t) ? t : [] } catch { return [] }
}
function write(t: TrailEntry[]) {
  try { sessionStorage.setItem(KEY, JSON.stringify(t.slice(-MAX))) } catch { /* private mode: Back falls back to its own link */ }
  try { window.dispatchEvent(new Event('cros-trail')) } catch { /* not in a browser */ }
}

export function recordVisit(url: string, path: string) {
  const t = readTrail()
  const top = t[t.length - 1], below = t[t.length - 2]
  if (below && below.url === url) t.pop()                                   // went back
  else if (top && top.url === url) return
  else if (top && top.path === path) t[t.length - 1] = { url, path, label: top.label }   // same screen, new tab/filter
  else t.push({ url, path, label: '' })
  write(t)
}

/** the screen's name, once it has drawn its heading */
export function nameVisit(url: string, label: string) {
  const t = readTrail()
  const top = t[t.length - 1]
  if (!top || top.url !== url || !label || top.label === label) return
  top.label = label
  write(t)
}

/** the screen before this one in this tab, if there is one */
export function previousVisit(): TrailEntry | null {
  const t = readTrail()
  return t.length > 1 ? t[t.length - 2] : null
}
