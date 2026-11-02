import { afterEach, describe, expect, it, vi } from 'vitest'
import { aiService } from './ai-service'
vi.mock('./supabase', () => ({ supabase: { auth: { getSession: async () => ({ data: { session: { access_token: 'synthetic-token' } } }) } }, normalizeSupabaseError: (error: unknown) => error }))
afterEach(() => vi.unstubAllGlobals())
describe('copilot response stream', () => {
  it('preserves split tokens, progress and final data across fragmented SSE frames', async () => {
    const chunks: string[] = [], statuses: string[] = []
    const wire = 'data: {"type":"status","message":"Reading expenses"}\r\n\r\ndata: {"type":"chunk","content":"Approved "}\r\n\r\ndata: {"type":"chunk","content":"₹350"}\r\n\r\ndata: {"type":"done","message":{"id":"reply"},"proposals":[]}\r\n\r\n'
    const bytes = new TextEncoder().encode(wire)
    vi.stubGlobal('fetch', vi.fn(async () => new Response(new ReadableStream({ start(controller) { for (let index = 0; index < bytes.length; index += 7) controller.enqueue(bytes.slice(index, index + 7)); controller.close() } }))))
    const result = await aiService.streamMessage(null, 'expenses', value => chunks.push(value), value => statuses.push(value))
    expect(statuses).toEqual(['Reading expenses'])
    expect(chunks).toEqual(['Approved ', 'Approved ₹350'])
    expect(result.message.id).toBe('reply')
  })
  it('treats server errors and incomplete streams as failures, never a zero expense answer', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('data: {"type":"error","error":"Records unavailable"}\n\n')))
    await expect(aiService.streamMessage(null, 'expenses', vi.fn())).rejects.toThrow('Records unavailable')
    vi.stubGlobal('fetch', vi.fn(async () => new Response('data: {"type":"chunk","content":"Partial"}\n\n')))
    await expect(aiService.streamMessage(null, 'expenses', vi.fn())).rejects.toThrow('before completion')
  })
})
