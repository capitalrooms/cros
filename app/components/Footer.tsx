import Image from 'next/image'

export default function Footer() {
  return (
    <footer style={{ background: '#0d0d0d', padding: '44px 32px 36px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '20px' }}>
      <Image
        src="/footer-logo.png"
        alt="Capital Rooms"
        width={120}
        height={120}
        priority
        style={{
          width: '120px',
          height: '120px',
          borderRadius: '50%',
          objectFit: 'cover',
          opacity: 0.55,
          filter: 'grayscale(30%)',
        }}
      />
      <p style={{
        fontFamily: '"Outfit", -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif',
        fontSize: '9px',
        color: '#363636',
        margin: 0,
        letterSpacing: '0.28em',
        textTransform: 'uppercase',
      }}>
        © 2026 Capital Rooms Ltd &nbsp;·&nbsp; London
      </p>
    </footer>
  )
}
