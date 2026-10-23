import { normalizeSupabaseError } from './supabase'

// Continue until an empty page: the server may cap a page below the requested size.
export async function fetchAllRows<T>(page: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>) {
  const data: T[] = []
  for (;;) {
    const result = await page(data.length, data.length + 249)
    if (result.error) throw normalizeSupabaseError(result.error)
    const rows = result.data ?? []
    if (!rows.length) return { data, error: null }
    data.push(...rows)
  }
}
