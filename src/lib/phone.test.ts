import {expect,it} from 'vitest'
import {normalizePhone} from './phone'
it('matches Indian local/country-code formats while retaining international country codes',()=>{
  expect(normalizePhone('+91 98765 43210')).toBe('9876543210')
  expect(normalizePhone('9876543210')).toBe('9876543210')
  expect(normalizePhone('+968 95171126')).toBe('96895171126')
  expect(normalizePhone('+971 58 834 1882')).toBe('971588341882')
})
