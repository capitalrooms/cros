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
      <p className="ps-hi">Good morning, Mr Spalding</p>
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
