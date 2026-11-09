// What CROS does for landlords and tenants, shown as the apps themselves (9 Nov 2026). Pure markup — the "screens" are
// drawn in HTML so they're crisp on every phone, readable by Google, and move as you scroll.
import { Tick } from './parts'

function Phone({ children, label }: { children: React.ReactNode; label: string }) {
  return (
    <div className="phone float" role="img" aria-label={label}>
      <div className="phone-notch" />
      <div className="phone-screen">{children}</div>
    </div>
  )
}

export function LandlordPhone() {
  return (
    <Phone label="The Capital Rooms landlord app: October statement paid, certificates up to date, a repair booked">
      <p className="ps-hi">Good morning, Mr Appleseed</p>
      <div className="ps-card dark">
        <span className="ps-k">October statement</span>
        <span className="ps-big">£2,846.20</span>
        <span className="ps-s">Paid to you · 1 November</span>
      </div>
      <div className="ps-card">
        <span className="ps-k">Certificates</span>
        {[['Gas safety', 'Mar 2027'], ['Electrical (EICR)', 'Jun 2029'], ['HMO licence', 'Aug 2030']].map(([t, d]) => (
          <span key={t} className="ps-row"><span className="ps-ok"><Tick /></span>{t}<span className="ps-dim">{d}</span></span>
        ))}
      </div>
      <div className="ps-card">
        <span className="ps-k">Repair · Room 3</span>
        <span className="ps-t">Leaking kitchen tap</span>
        <span className="ps-bar"><span className="fill" /></span>
        <span className="ps-s">Plumber booked · Thursday 9–12</span>
      </div>
    </Phone>
  )
}

export function TenantPhone() {
  return (
    <Phone label="The Capital Rooms tenant app: report a repair with a photo, a visit booked, the house guide">
      <p className="ps-hi">Hello Ama</p>
      <div className="ps-card gold">
        <span className="ps-k">Report a repair</span>
        <span className="ps-t">Shower’s not draining</span>
        <span className="ps-photos"><span /><span /><span className="add">+</span></span>
        <span className="ps-s">Sent with 2 photos · we’ll book it in</span>
      </div>
      <div className="ps-card">
        <span className="ps-k">Coming up</span>
        <span className="ps-row">Cleaner · Tuesday morning</span>
        <span className="ps-row">Plumber · Thursday 9–12</span>
      </div>
      <div className="ps-card">
        <span className="ps-k">House guide</span>
        <span className="ps-row">Wi-Fi password<span className="ps-dim">Tap to copy</span></span>
        <span className="ps-row">Bins out<span className="ps-dim">Monday night</span></span>
        <span className="ps-row">Your housemates<span className="ps-dim">Say hello</span></span>
      </div>
    </Phone>
  )
}

const Dot = ({ s }: { s: 'ok' | 'soon' | 'now' | 'todo' }) => <span className={`ps-dot ${s}`} aria-hidden="true">{s === 'ok' ? <Tick /> : null}</span>

export function CompliancePhone() {
  return (
    <Phone label="Compliance tracker: every certificate with its status and next date">
      <p className="ps-hi">Your certificates</p>
      <div className="ps-card dark"><span className="ps-k">Compliance</span><span className="ps-big">All in date</span><span className="ps-s">Next renewal booked for you</span></div>
      <div className="ps-card">
        {([['ok', 'Gas safety', 'Booked 12 Feb'], ['ok', 'Electrical (EICR)', 'Jun 2029'], ['ok', 'EPC', 'Rating C'], ['ok', 'Fire alarms tested', 'This month'], ['soon', 'HMO licence', 'Renewal sent']] as const).map(([s, t, d]) => (
          <span key={t} className="ps-row"><Dot s={s} />{t}<span className="ps-dim">{d}</span></span>
        ))}
      </div>
      <div className="ps-card gold"><span className="ps-k">New certificate</span><span className="ps-t">Gas safety 2026 emailed to you</span><span className="ps-s">And filed in your portal, ready to download</span></div>
    </Phone>
  )
}

export function RepairPhone() {
  return (
    <Phone label="A repair from report to done: photos, quotes compared, approved, booked, finished">
      <p className="ps-hi">Leaking kitchen tap</p>
      <div className="ps-card">
        {([['ok', 'Reported with 2 photos', 'Mon'], ['ok', '3 quotes compared', 'Mon'], ['ok', 'You approved £140', 'Tue'], ['now', 'Plumber booked', 'Thu 9–12'], ['todo', 'Done, with photos', '']] as const).map(([s, t, d]) => (
          <span key={t} className="ps-row"><Dot s={s} />{t}<span className="ps-dim">{d}</span></span>
        ))}
      </div>
      <div className="ps-card gold"><span className="ps-k">No mark-up</span><span className="ps-t">You pay what the contractor charges</span><span className="ps-s">Invoice attached to your statement</span></div>
      <div className="ps-card"><span className="ps-k">Tenants told</span><span className="ps-row">Visit time sent to the house automatically</span></div>
    </Phone>
  )
}

export function StatementPhone() {
  return (
    <Phone label="Monthly statement: rent in, fees and repairs out, paid to you; annual summary for your accountant">
      <p className="ps-hi">October statement</p>
      <div className="ps-card">
        {([['Rent received', '£3,400.00'], ['Management 12% + VAT', '−£489.60'], ['Repair: kitchen tap', '−£140.00']] as const).map(([t, v]) => <span key={t} className="ps-row">{t}<span className="ps-dim" style={{ opacity: 1, fontWeight: 600 }}>{v}</span></span>)}
        <span className="ps-row" style={{ borderTop: '1px solid #E3E8E2', paddingTop: 6, fontWeight: 700 }}>Paid to you<span style={{ marginLeft: 'auto' }}>£2,770.40</span></span>
      </div>
      <div className="ps-card dark"><span className="ps-k">Tax year 2025–26</span><span className="ps-t">Annual summary ready</span><span className="ps-s">Set out the way HMRC asks for it</span></div>
      <div className="ps-card"><span className="ps-k">Download</span><span className="ps-row">PDF and spreadsheet, any month</span></div>
    </Phone>
  )
}

export function LettingPhone() {
  return (
    <Phone label="Letting a room: advertised everywhere, viewings booked, referenced, signed online, deposit protected">
      <p className="ps-hi">Room 2 · new tenant</p>
      <div className="ps-card">
        {([['ok', 'Advertised on the portals', ''], ['ok', '9 viewings booked', ''], ['ok', 'Holding deposit paid', ''], ['now', 'References with Homeppl', 'Today'], ['todo', 'Signed online', ''], ['todo', 'Deposit protected (DPS)', '']] as const).map(([s, t, d]) => (
          <span key={t} className="ps-row"><Dot s={s} />{t}<span className="ps-dim">{d}</span></span>
        ))}
      </div>
      <div className="ps-card gold"><span className="ps-k">You’re kept updated</span><span className="ps-t">A short email at each step</span></div>
    </Phone>
  )
}

export function MoveInPhone() {
  return (
    <Phone label="Moving in from your phone: apply, reserve, references, sign, keys">
      <p className="ps-hi">Your move</p>
      <div className="ps-card dark"><span className="ps-k">Moving in</span><span className="ps-big">1 December</span><span className="ps-s">Room 3, Orchard Road</span></div>
      <div className="ps-card">
        {([['ok', 'Application sent', ''], ['ok', 'Room reserved', ''], ['now', 'References', 'In progress'], ['todo', 'Sign your agreement', ''], ['todo', 'Keys and welcome pack', '']] as const).map(([s, t, d]) => (
          <span key={t} className="ps-row"><Dot s={s} />{t}<span className="ps-dim">{d}</span></span>
        ))}
      </div>
    </Phone>
  )
}

export function HousePhone() {
  return (
    <Phone label="Your house: housemates, cleaning day, bins, Wi-Fi and the emergency number">
      <p className="ps-hi">Your house</p>
      <div className="ps-card">
        <span className="ps-k">Housemates</span>
        <span className="ps-faces">{['T', 'P', 'L', 'S'].map(x => <span key={x}>{x}</span>)}</span>
        <span className="ps-s">Say hello before you move in</span>
      </div>
      <div className="ps-card">
        {([['Cleaner', 'Tuesday'], ['Bins out', 'Monday night'], ['Wi-Fi', 'Tap to copy'], ['Heating', 'How it works']] as const).map(([t, d]) => <span key={t} className="ps-row">{t}<span className="ps-dim">{d}</span></span>)}
      </div>
      <div className="ps-card gold"><span className="ps-k">Emergency?</span><span className="ps-t">Call us any time, day or night</span></div>
    </Phone>
  )
}

export function ExpensesPhone() {
  return (
    <Phone label="Every expense itemised: each repair and bill on its own line, by category, with the invoice attached">
      <p className="ps-hi">Expenses this year</p>
      <div className="ps-card">
        <span className="ps-k">By category</span>
        {([['Plumbing', '£620', 62], ['Electrics', '£410', 41], ['Safety certificates', '£280', 28], ['Cleaning', '£960', 96], ['Furniture', '£350', 35]] as const).map(([t, v, w]) => (
          <span key={t} className="ps-cat"><span className="ps-row" style={{ padding: 0 }}>{t}<span className="ps-dim" style={{ opacity: 1, fontWeight: 600 }}>{v}</span></span><span className="ps-bar slim"><span className="fill" style={{ width: `${w}%` }} /></span></span>
        ))}
      </div>
      <div className="ps-card">
        <span className="ps-k">Latest</span>
        <span className="ps-row">Kitchen tap, Room 3<span className="ps-dim" style={{ opacity: 1, fontWeight: 600 }}>£140</span></span>
        <span className="ps-s">Invoice and photos attached</span>
      </div>
    </Phone>
  )
}

// small line icons for the benefit tiles
const I: Record<string, React.ReactNode> = {
  wrench: <path d="M14.7 6.3a4 4 0 0 0 5 5L13 18l-3 3-4-4 3-3 6.7-6.7zM4 20l2-2" />,
  receipt: <path d="M6 3h12v18l-3-2-3 2-3-2-3 2zM9 8h6M9 12h6M9 16h4" />,
  shield: <path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z M9 12l2 2 4-4" />,
  doc: <path d="M7 3h7l5 5v13H7zM14 3v5h5M10 13h6M10 17h6" />,
  chart: <path d="M4 20V10M10 20V4M16 20v-7M22 20H2" />,
  camera: <path d="M4 7h4l2-3h4l2 3h4v12H4zM12 17a4 4 0 1 0 0-8 4 4 0 0 0 0 8z" />,
  mail: <path d="M3 6h18v12H3zM3 7l9 6 9-6" />,
  check: <path d="M5 12l5 5 9-10" />,
  phone: <path d="M6 3h4l2 5-3 2a11 11 0 0 0 5 5l2-3 5 2v4a2 2 0 0 1-2 2A17 17 0 0 1 4 5a2 2 0 0 1 2-2z" />,
  sparkle: <path d="M12 3l1.8 4.6L18 9.4l-4.2 1.8L12 16l-1.8-4.8L6 9.4l4.2-1.8zM19 15l.9 2.1L22 18l-2.1.9L19 21l-.9-2.1L16 18l2.1-.9z" />,
  people: <path d="M9 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM3 20c.6-3.2 3-5 6-5s5.4 1.8 6 5M16 5a3 3 0 0 1 0 6M18 15c1.8.6 2.8 2.2 3 5" />,
  home: <path d="M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z" />,
  broom: <path d="M14 3l-3 9M8 12h8l2 9H6zM10 16v5M14 16v5" />,
  bell: <path d="M6 16V11a6 6 0 1 1 12 0v5l2 2H4zM10 21h4" />,
  key: <path d="M8 15a4 4 0 1 0 0-.01M11 12l9-9M17 6l3 3" />,
  pen: <path d="M4 20l4-1 11-11-3-3L5 16zM14 6l3 3" />,
}
export function Benefits({ items }: { items: [string, string, string][] }) {
  return (
    <div className="benefits">
      {items.map(([ico, t, d]) => (
        <div key={t} className="benefit rise">
          <span className="ico"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{I[ico]}</svg></span>
          <strong>{t}</strong><span>{d}</span>
        </div>
      ))}
    </div>
  )
}
