/** Deterministic karaoke pricing and safe WhatsApp deep links for AKOCP. */
export type KaraokeFormat = 'audio' | 'video'
export type QuoteResult =
  | { status: 'ready'; amount: number; code: 'AU150' | 'ML350' | 'OL450'; provisional: boolean }
  | { status: 'needs_language' }

export function customKaraokeQuote(format: KaraokeFormat, language?: string | null, languageVerified = false): QuoteResult {
  if (format === 'audio') return { status: 'ready', amount: 150, code: 'AU150', provisional: false }
  const normalized = (language ?? '').trim().toLocaleLowerCase('en-IN')
  if (!normalized || ['unknown', 'other', 'unverified'].includes(normalized)) return { status: 'needs_language' }
  const malayalam = ['malayalam', 'മലയാളം', 'ml', 'ml-in'].includes(normalized)
  return { status: 'ready', amount: malayalam ? 350 : 450, code: malayalam ? 'ML350' : 'OL450', provisional: !languageVerified }
}

/** Validating a telephone number does not prove that it has a WhatsApp account. */
export function whatsappDigits(raw: string | null | undefined): string | null {
  const input = (raw ?? '').trim()
  const digits = input.replace(/\D/g, '')
  if (/^[6-9]\d{9}$/.test(digits)) return '91' + digits
  if (/^91[6-9]\d{9}$/.test(digits)) return digits
  if (input.startsWith('+') && /^[1-9]\d{7,14}$/.test(digits)) return digits
  return null
}

export function malayalamOrderDraft(input: {
  customer?: string | null
  song: string
  format: KaraokeFormat
  price?: number | null
  orderNumber?: string | null
  confirmed: boolean
}) {
  const customer = input.customer?.trim()
  const label = input.format === 'audio' ? 'ഓഡിയോ കരോക്കെ' : 'ലിറിക്സ് വീഡിയോ കരോക്കെ'
  const price = input.price == null ? 'സ്ഥിരീകരിക്കേണ്ടതാണ്' : '₹' + input.price.toLocaleString('en-IN')
  const status = input.confirmed
    ? 'താങ്കൾ ഫോൺ വഴി ഓർഡറിന് സമ്മതം അറിയിച്ചിട്ടുണ്ട്. അന്തിമ സ്ഥിരീകരണം ഞങ്ങളുടെ ടീം അറിയിക്കും.'
    : 'താങ്കളുടെ കരോക്കെ അന്വേഷണമാണിത്. ഓർഡർ ഇതുവരെ സ്ഥിരീകരിച്ചിട്ടില്ല.'
  return ['നമസ്കാരം' + (customer ? ' ' + customer : '') + ' 👋',
    'Abhinand Karaokes-നെ ബന്ധപ്പെട്ടതിന് നന്ദി.',
    '🎵 പാട്ട്: ' + input.song,
    '🎧 ഫോർമാറ്റ്: ' + label,
    '💰 വില: ' + price,
    ...(input.orderNumber ? ['🧾 ഓർഡർ: ' + input.orderNumber] : []),
    status, '— Abhinand Karaokes'].join('\n\n')
}

export function whatsappDraftUrl(phone: string | null | undefined, message: string): string | null {
  const digits = whatsappDigits(phone)
  return digits ? 'https://wa.me/' + digits + '?text=' + encodeURIComponent(message) : null
}
