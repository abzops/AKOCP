import { describe, expect, it } from 'vitest'
import type { InventoryTrack } from '../types'
import { inventoryCursorValue, parseInventorySummary } from './supabase-service'

const track: InventoryTrack = {
  id: '00000000-0000-4000-8000-000000000001',
  track_name: 'Pavizha Mazha',
  english_title: 'Pavizha Mazha',
  language: 'Malayalam',
  tags: ['movie'],
  total_orders: 7,
  lifetime_revenue: 1250,
  created_at: '2026-07-29T00:00:00Z',
  updated_at: '2026-07-29T00:00:00Z'
}

describe('inventory paging contract', () => {
  it('normalizes the database summary and preserves multilingual metadata', () => {
    expect(parseInventorySummary({
      totalAssets: '1496',
      totalRevenue: '1250',
      reusedAssets: '2',
      topTrack: track,
      languages: ['Malayalam', 'Hindi']
    })).toEqual({
      totalAssets: 1496,
      totalRevenue: 1250,
      reusedAssets: 2,
      topTrack: track,
      languages: ['Malayalam', 'Hindi']
    })
  })

  it('uses the stable sort value required by each keyset cursor', () => {
    expect(inventoryCursorValue(track, 'orders')).toBe('7')
    expect(inventoryCursorValue(track, 'revenue')).toBe('1250')
    expect(inventoryCursorValue(track, 'recent')).toBe(track.created_at)
    expect(inventoryCursorValue(track, 'name')).toBe('pavizha mazha')
  })
})
