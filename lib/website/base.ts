// Where the website's links point: '' on capitalrooms.co.uk, '/site' on the app's address (the private preview).
import { headers } from 'next/headers'
export async function siteBase() {
  const host = ((await headers()).get('host') ?? '').toLowerCase().split(':')[0]
  return host === 'capitalrooms.co.uk' || host === 'www.capitalrooms.co.uk' ? '' : '/site'
}
