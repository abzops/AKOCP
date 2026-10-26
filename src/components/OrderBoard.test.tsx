import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { OrderBoard } from './OrderBoard'
import { workflowMoveError, workflowTargets } from '../lib/order-workflow'
import type { Order } from '../types'

const order: Order = { id: 'board-test', order_number: 'AK-BOARD', customer_id: 'c', service_id: 's', track_name: 'Board test song', language: 'Malayalam', status: 'in_progress', payment_status: 'confirmed', price: 350, created_by: 'owner', created_at: '2026-10-23T00:00:00Z', updated_at: '2026-10-23T00:00:00Z' }
afterEach(() => { cleanup(); vi.restoreAllMocks() })

describe('workflow board moves', () => {
  it('exposes only valid stages and keeps payment/finalized guards', () => {
    expect(workflowTargets({ ...order, status: 'payment_pending', payment_status: 'unpaid' })).toEqual(['cancelled'])
    expect(workflowTargets({ ...order, status: 'payment_pending' })).toEqual(['in_progress', 'cancelled'])
    expect(workflowTargets(order)).toEqual(['completed', 'cancelled'])
    expect(workflowTargets({ ...order, status: 'completed' })).toEqual(['delivered'])
    for (const status of ['delivered', 'cancelled'] as const) expect(workflowTargets({ ...order, status })).toEqual([])
    expect(workflowMoveError(order, 'delivered')).toMatch(/Complete the order/)
    expect(workflowMoveError({ ...order, payment_status: 'proof_uploaded' }, 'completed')).toMatch(/Confirm payment/)
  })
  it('routes completion for review, locks during saving and waits for refreshed data before moving a card', async () => {
    let finish!: () => void
    const move = vi.fn(() => new Promise<void>(resolve => { finish = resolve }))
    render(<OrderBoard orders={[order]} payments={[]} onOpen={vi.fn()} onMove={move} />)
    const menu = screen.getByRole('combobox', { name: 'Move AK-BOARD to' })
    fireEvent.change(menu, { target: { value: 'completed' } })
    expect(move).toHaveBeenCalledWith(order, 'completed')
    expect(menu).toBeDisabled()
    expect(within(screen.getByRole('region', { name: 'In progress orders' })).getByRole('button', { name: /^AK-BOARD/ })).toBeVisible()
    fireEvent.change(menu, { target: { value: 'cancelled' } })
    expect(move).toHaveBeenCalledOnce()
    finish()
    await waitFor(() => expect(menu).toBeEnabled())
  })
  it('keeps cards and reports failure; offline controls cannot submit moves', async () => {
    const move = vi.fn().mockRejectedValue(new Error('Connection interrupted'))
    const props = { orders: [order], payments: [], onOpen: vi.fn(), onMove: move }
    const view = render(<OrderBoard {...props} />)
    fireEvent.change(screen.getByRole('combobox', { name: 'Move AK-BOARD to' }), { target: { value: 'completed' } })
    await screen.findByText('Connection interrupted')
    expect(screen.getByRole('button', { name: /^AK-BOARD/ })).toBeVisible()
    view.rerender(<OrderBoard {...props} disabled />)
    expect(screen.getByRole('button', { name: 'Drag AK-BOARD' })).toBeDisabled()
    expect(screen.getByRole('combobox', { name: 'Move AK-BOARD to' })).toBeDisabled()
  })
  it('drags by keyboard into the next available column without opening card details', async () => {
    const rect = (left: number, top: number, width: number, height: number) => ({ left, top, width, height, right: left + width, bottom: top + height, x: left, y: top, toJSON: () => ({}) })
    vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function(this: Element) {
      const label = this.getAttribute('aria-label')
      const columns = ['Inquiry orders', 'Payment pending orders', 'In progress orders', 'Completed orders', 'Delivered orders', 'Cancelled orders']
      const index = columns.indexOf(label ?? '')
      if (index >= 0) return rect(index * 260, 0, 250, 600)
      if (this.classList.contains('ops-board-card')) return rect(535, 60, 220, 250)
      if (this.classList.contains('ops-board-preview') || this.querySelector(':scope > .ops-board-preview')) return rect(535, 60, 220, 250)
      if (this.classList.contains('ops-board-grip')) return rect(540, 260, 44, 44)
      return rect(0, 0, 1800, 800)
    })
    const move = vi.fn(), open = vi.fn()
    render(<OrderBoard orders={[order]} payments={[]} onOpen={open} onMove={move} />)
    const grip = screen.getByRole('button', { name: 'Drag AK-BOARD' })
    grip.focus()
    fireEvent.keyDown(grip, { code: 'Space', key: ' ' })
    await waitFor(() => expect(grip).toHaveAttribute('aria-pressed', 'true'))
    // The keyboard sensor installs its document listener on the next timer tick.
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 0)) })
    fireEvent.keyDown(document, { code: 'ArrowRight', key: 'ArrowRight' })
    await waitFor(() => expect(screen.getByRole('region', { name: 'Completed orders' })).toHaveClass('ops-board-over'))
    fireEvent.keyDown(document, { code: 'Space', key: ' ' })
    await waitFor(() => expect(move).toHaveBeenCalledWith(order, 'completed'))
    expect(open).not.toHaveBeenCalled()
  })
})
