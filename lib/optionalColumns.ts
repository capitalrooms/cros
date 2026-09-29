// Some columns arrive with migration 183. Until it has run, a write that includes them fails with
// Postgres error 42703 (undefined column). Run the write with them, and if that is the only problem,
// run it again without — so the save still goes through instead of failing.
export async function withOptionalColumns<R extends { error: { code?: string } | null }>(
  run: (includeOptional: boolean) => PromiseLike<R>,
): Promise<R> {
  const first = await run(true)
  if (first.error?.code === '42703') return run(false)
  return first
}
