import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { OrdersPage } from './OrdersPage'
import type { Order } from '../types'

const state = vi.hoisted(() => ({ service: { updateOrderStatus: vi.fn(), completeOrder: vi.fn() }, execute: vi.fn(), snapshot: { orders: [] as Order[], payments: [], customers: [], services: [], profiles: [], inventoryTracks: [] } }))
vi.mock('../context/AuthContext', () => ({ useAuth: () => ({ profile: { id: 'owner', role: 'founder' } }) }))
vi.mock('../context/AppDataContext', () => ({ useAppData: () => ({ snapshot: state.snapshot, service: state.service, offline: false, busyAction: null, execute: state.execute, showToast: vi.fn() }) }))
afterEach(() => { cleanup(); vi.clearAllMocks() })

describe('board review handoffs', () => {
  it('opens completion and cancellation review without saving either from the drop/menu action', async () => {
    state.snapshot.orders = [{ id: 'o', order_number: 'AK-REVIEW', status: 'in_progress', payment_status: 'confirmed', track_name: 'Review song', created_at: '2026-10-23T00:00:00Z', price: 350 } as Order]
    render(<MemoryRouter><OrdersPage /></MemoryRouter>)
    fireEvent.change(screen.getByRole('combobox', { name: 'Move AK-REVIEW to' }), { target: { value: 'completed' } })
    expect(screen.getByRole('heading', { name: 'Complete karaoke order' })).toBeVisible()
    expect(screen.getByText('Add “Review song” to inventory?')).toBeVisible()
    expect(state.service.completeOrder).not.toHaveBeenCalled()
    expect(state.service.updateOrderStatus).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Not yet' }))
    await waitFor(() => expect(screen.getByRole('combobox', { name: 'Move AK-REVIEW to' })).toBeEnabled())
    fireEvent.change(screen.getByRole('combobox', { name: 'Move AK-REVIEW to' }), { target: { value: 'cancelled' } })
    expect(screen.getByRole('heading', { name: 'Cancel this order?' })).toBeVisible()
    expect(state.service.updateOrderStatus).not.toHaveBeenCalled()
  })
})
