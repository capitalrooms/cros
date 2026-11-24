// Dry run (Harry, 22 Nov 2026): run the real screens against the real figures, but nothing is written and nothing is sent.
// Switched on only by CROS_DRY_RUN=1 on the machine running it (never set on the live site, so it can't affect it).
// Reads work as normal. Every write to the database returns an error saying so, and every email or text is refused.
// Storage uploads and sign-in changes are not covered by this guard, so keep dry runs to reading and previewing.
export const DRY_RUN = process.env.CROS_DRY_RUN === '1' || process.env.NEXT_PUBLIC_CROS_DRY_RUN === '1'   // the public one lets the browser see it too
export const DRY_RUN_MESSAGE = 'Dry run: nothing is written or sent. Switch dry run off to make changes.'

const WRITES = new Set(['insert', 'update', 'upsert', 'delete'])
// Database functions that only read. Any other function is refused in dry run.
const READ_RPCS = new Set(['cros_is_practice', 'cros_my_house_viewings'])

/** A query builder that accepts any chain of calls, and whose result is always "nothing written". */
function refusedBuilder(): any {
  const err = { message: DRY_RUN_MESSAGE, code: 'DRY_RUN', details: null, hint: null }
  const p: any = new Proxy({}, {
    get: (_t, prop) => {
      if (prop === 'then') return (resolve: (v: unknown) => unknown) => resolve({ data: null, error: err, count: null, status: 0, statusText: 'dry run' })
      if (prop === 'catch') return () => p
      if (prop === 'finally') return (fn: () => void) => { fn(); return p }
      return () => p
    },
  })
  return p
}

/** Wrap a Supabase client so that writes are refused while dry run is on. Reads pass straight through. */
export function guardWrites<T extends { from: (...a: any[]) => any; rpc: (...a: any[]) => any }>(client: T): T {
  if (!DRY_RUN) return client
  return new Proxy(client, {
    get(target, prop, receiver) {
      if (prop === 'from') return (...args: any[]) => {
        const builder = target.from(...args)
        return new Proxy(builder, {
          get(b, method, r) {
            if (typeof method === 'string' && WRITES.has(method)) return () => refusedBuilder()
            const v = Reflect.get(b, method, r)
            return typeof v === 'function' ? v.bind(b) : v
          },
        })
      }
      // Database functions are refused too, except the ones that only read (so the screens that use them still load)
      if (prop === 'rpc') return (name: string, ...rest: any[]) =>
        READ_RPCS.has(name) ? target.rpc(name, ...rest) : refusedBuilder()
      return Reflect.get(target, prop, receiver)
    },
  })
}
