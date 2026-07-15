import { describe, expect, it } from 'vitest'
import { formatCurrency, humanize, normalizeSearch } from './format'

describe('format helpers', () => {
  it('formats Indian rupees without paise', () => {
    expect(formatCurrency(1250)).toContain('1,250')
  })

  it('normalizes business search text', () => {
    expect(normalizeSearch('  Pavizha MAZHA ')).toBe('pavizha mazha')
    expect(normalizeSearch('പവിഴ മഴ')).toBe('പവിഴ മഴ')
  })

  it('humanizes database labels', () => {
    expect(humanize('profit_share')).toBe('Profit Share')
  })
})
