// Opening a document without getting stuck (13 Nov 2026, Harry: "opened [a Homeppl doc] … could not get out of it, I had
// to close the app"). On the installed app (home-screen, no browser bar) a new window can take over the whole app with
// no way back — so there the file opens in CROS's own viewer (app/components/FileViewer) with a Close button. In a
// normal browser it still opens in a new tab, as before.
export const isInstalledApp = () => typeof window !== 'undefined' && (window.matchMedia?.('(display-mode: standalone)').matches || (navigator as any).standalone === true)

/** Show a file in the in-app viewer. */
export function viewFile(url: string, name?: string) {
  window.dispatchEvent(new CustomEvent('cros:view-file', { detail: { url, name } }))
}

/** Open a file whose link has to be fetched first (signed link, blob of a PDF). getUrl returns the link, or throws. */
export async function openSafely(getUrl: () => Promise<string | null>, name?: string) {
  if (isInstalledApp()) {
    try { const u = await getUrl(); if (u) viewFile(u, name); else alert('That file can’t be opened — please sign in again, or ask the office.') }
    catch (e) { alert(e instanceof Error ? e.message : 'Could not open it') }
    return
  }
  const win = window.open('', '_blank')   // opened now, while the click still counts, or the browser blocks it
  try {
    const u = await getUrl()
    if (u && win) win.location.href = u
    else if (u) window.location.href = u
    else { win?.close(); alert('That file can’t be opened — please sign in again, or ask the office.') }
  } catch (e) { win?.close(); alert(e instanceof Error ? e.message : 'Could not open it') }
}
