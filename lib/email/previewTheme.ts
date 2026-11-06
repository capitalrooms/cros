// While the Email hub makes a preview, every email built inside it uses the theme being previewed and isn't kept as a
// real example (lib/emailWrapper buildEmail reads this). Server-only.
import { AsyncLocalStorage } from 'node:async_hooks'
import type { EmailTheme } from '@/lib/email/themes'

export const previewTheme = new AsyncLocalStorage<EmailTheme>()
