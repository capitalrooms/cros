/**
 * Capital Rooms email template — single source.
 *
 * All functions re-export from lib/emailWrapper.ts.
 * The header, footer, and business details live there.
 *
 * emailHtml() is now async — every call site must await it.
 */

export {
  buildEmail as emailHtml,
  tableRow,
  ctaButton,
  FROM,
  PORTAL_URL,
  wrapEmail,
  getBusinessSettings,
  type BusinessSettings,
} from '@/lib/emailWrapper'
