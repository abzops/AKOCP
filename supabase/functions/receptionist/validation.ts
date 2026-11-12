/** Pure guard: the price the caller accepted must equal the trusted backend quote. */
export function matchesSpokenPrice(approved: boolean, spoken: unknown, authoritative: number | null): boolean {
  if (!approved) return true
  if (typeof spoken !== 'number' || !Number.isFinite(spoken) || spoken <= 0) return false
  if (authoritative === null || !Number.isFinite(authoritative) || authoritative <= 0) return false
  return Math.round(spoken * 100) === Math.round(authoritative * 100)
}
