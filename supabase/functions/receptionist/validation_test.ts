import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts'
import { matchesSpokenPrice } from './validation.ts'

Deno.test('caller approval at exact verified custom price is accepted', () => {
  assertEquals(matchesSpokenPrice(true, 150, 150), true)
  assertEquals(matchesSpokenPrice(true, 350, 350), true)
  assertEquals(matchesSpokenPrice(true, 450, 450), true)
})
Deno.test('mismatch, absent amount, or hallucinated price cannot be marked approved', () => {
  assertEquals(matchesSpokenPrice(true, 350, 450), false)
  assertEquals(matchesSpokenPrice(true, 450, 350), false)
  assertEquals(matchesSpokenPrice(true, undefined, 450), false)
  assertEquals(matchesSpokenPrice(true, '450', 450), false)
  assertEquals(matchesSpokenPrice(true, 450, null), false)
  assertEquals(matchesSpokenPrice(true, Number.NaN, 450), false)
})
Deno.test('unapproved enquiries remain allowable even without a quote', () => {
  assertEquals(matchesSpokenPrice(false, null, null), true)
})
