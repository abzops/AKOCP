import { describe, expect, it } from 'vitest'
import { fetchAllRows } from './paging'

describe('complete business history loading', () => {
  it('reads beyond API caps, including caps smaller than the requested page', async () => {
    const history = Array.from({ length: 1205 }, (_, id) => ({ id }))
    const result = await fetchAllRows(async (from, to) => ({ data: history.slice(from, Math.min(to + 1, from + 100)), error: null }))
    expect(result.data).toEqual(history)
  })
  it('rejects incomplete history when a later page fails', async () => {
    await expect(fetchAllRows(async (from) => from === 0
      ? { data: [{ id: 1 }], error: null }
      : { data: null, error: { message: 'Connection lost' } }
    )).rejects.toThrow('Connection lost')
  })
})
