import { describe, expect, it } from 'vitest'
import { customKaraokeQuote, malayalamOrderDraft, whatsappDigits, whatsappDraftUrl } from './receptionist-core'

describe('custom karaoke rates',()=>{
 it('audio always costs 150',()=>expect(customKaraokeQuote('audio')).toEqual({status:'ready',amount:150,code:'AU150',provisional:false}))
 it('Malayalam video costs 350 when verified',()=>expect(customKaraokeQuote('video','മലയാളം',true)).toEqual({status:'ready',amount:350,code:'ML350',provisional:false}))
 it('other language video costs 450',()=>expect(customKaraokeQuote('video','Tamil')).toEqual({status:'ready',amount:450,code:'OL450',provisional:true}))
 it('unknown language cannot produce a final video quote',()=>{
  expect(customKaraokeQuote('video','unknown')).toEqual({status:'needs_language'})
  expect(customKaraokeQuote('video','')).toEqual({status:'needs_language'})
 })
})
describe('WhatsApp handoff',()=>{
 it('normalizes numbers without claiming account exists',()=>{
  expect(whatsappDigits('98765 43210')).toBe('919876543210')
  expect(whatsappDigits('+91 98765 43210')).toBe('919876543210')
  expect(whatsappDigits('123')).toBeNull()
 })
 it('builds an editable click-to-chat link only',()=>{
  const message=malayalamOrderDraft({song:'പാട്ട്',format:'audio',price:150,confirmed:false})
  expect(message).toContain('ഇതുവരെ സ്ഥിരീകരിച്ചിട്ടില്ല')
  expect(whatsappDraftUrl('9876543210',message)).toContain('https://wa.me/919876543210?text=')
 })
 it('verbal approval is not financial confirmation',()=>{
  expect(malayalamOrderDraft({song:'Song',format:'video',price:350,confirmed:true})).toContain('അന്തിമ സ്ഥിരീകരണം')
 })
})
