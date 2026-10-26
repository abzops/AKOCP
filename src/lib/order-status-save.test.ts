import { beforeEach, describe, expect, it, vi } from 'vitest'
import { supabaseDataService } from './supabase-service'
import type { Profile } from '../types'

const db = vi.hoisted(() => ({ from: vi.fn(), update: vi.fn(), eq: vi.fn(), select: vi.fn(), maybeSingle: vi.fn() }))
vi.mock('./supabase', () => ({ supabase: db, normalizeSupabaseError: (error: Error) => error }))
beforeEach(() => { vi.clearAllMocks(); db.from.mockReturnValue(db); db.update.mockReturnValue(db); db.eq.mockReturnValue(db); db.select.mockReturnValue(db) })

describe('status save conflict detection', () => {
  it('only delivers an order that is still completed and checks the returned row', async () => {
    db.maybeSingle.mockResolvedValue({ data: { id: 'o' }, error: null })
    await supabaseDataService.updateOrderStatus('o', 'delivered', {} as Profile, 'completed')
    expect(db.eq).toHaveBeenCalledWith('status', 'completed')
    expect(db.eq).toHaveBeenCalledWith('id', 'o')
    expect(db.update).toHaveBeenCalledWith(expect.objectContaining({ status: 'delivered', delivered_at: expect.any(String) }))
    expect(db.select).toHaveBeenCalledWith('id')
  })
  it('reports a stale, missing or inaccessible order instead of claiming a successful move', async () => {
    db.maybeSingle.mockResolvedValue({ data: null, error: null })
    await expect(supabaseDataService.updateOrderStatus('o', 'cancelled', {} as Profile, 'in_progress')).rejects.toThrow('Refresh the board')
  })
})
