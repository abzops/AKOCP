import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { CopilotDrawer } from './CopilotDrawer'
const ai = vi.hoisted(() => ({ getSettings: vi.fn(), getUsage: vi.fn(), listConversations: vi.fn(), getConversation: vi.fn(), streamMessage: vi.fn() }))
const state = vi.hoisted(() => ({ profile: { id: 'owner', role: 'founder', full_name: 'Owner' }, data: { snapshot: null, service: {}, refresh: vi.fn(), showToast: vi.fn() } }))
vi.mock('../context/AuthContext', () => ({ useAuth: () => ({ profile: state.profile }) }))
vi.mock('../context/AppDataContext', () => ({ useAppData: () => state.data }))
vi.mock('../lib/ai-service', () => ({ aiService: ai, proposalStaleReason: () => null }))
beforeEach(() => {
  ai.getSettings.mockResolvedValue({ enabled: true, provider_status: 'available' })
  ai.getUsage.mockResolvedValue({ remaining: 39 })
  ai.listConversations.mockResolvedValue([])
  ai.getConversation.mockResolvedValue({ messages: [], proposals: [] })
})
afterEach(() => { cleanup(); vi.clearAllMocks() })
describe('copilot interaction', () => {
  it('keeps the returned answer in place without reloading conversation history after every send', async () => {
    ai.streamMessage.mockResolvedValue({ message: { id: 'answer', conversation_id: 'chat', sender: 'assistant', content: '**Approved expenses: ₹350**', created_at: new Date().toISOString(), model: 'verified-expense-report' }, proposals: [], usage: { remaining: 38 } })
    render(<MemoryRouter><CopilotDrawer open onClose={vi.fn()}/></MemoryRouter>)
    const input = screen.getByRole('textbox', { name: 'Message Operations Copilot' })
    await waitFor(() => expect(input).toBeEnabled())
    fireEvent.change(input, { target: { value: 'expenses last month' } })
    fireEvent.click(screen.getByRole('button', { name: 'Send message' }))
    await screen.findByText('Approved expenses: ₹350', {}, { timeout: 5000 })
    expect(ai.getConversation).not.toHaveBeenCalled()
    expect(screen.getByText('38 prompts left today')).toBeVisible()
    expect(screen.getByRole('button', { name: 'Copy answer' })).toBeVisible()
  })
  it('keeps the question ready to retry when the request fails', async () => {
    ai.streamMessage.mockRejectedValue(new Error('Network unavailable'))
    render(<MemoryRouter><CopilotDrawer open onClose={vi.fn()}/></MemoryRouter>)
    const input = screen.getByRole('textbox', { name: 'Message Operations Copilot' })
    await waitFor(() => expect(input).toBeEnabled())
    fireEvent.change(input, { target: { value: 'what needs attention today?' } })
    fireEvent.click(screen.getByRole('button', { name: 'Send message' }))
    await screen.findByText('Network unavailable')
    expect(input).toHaveValue('what needs attention today?')
    expect(screen.getByRole('button', { name: 'Send message' })).toBeEnabled()
  })
})
