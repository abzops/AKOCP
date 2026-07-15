import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Modal } from './ui'

afterEach(cleanup)

describe('Modal', () => {
  it('renders the overlay directly under body so page transforms cannot trap it', () => {
    const { rerender } = render(
      <Modal open onClose={vi.fn()} title="Scrollable form">
        <div>Long form content</div>
      </Modal>,
    )

    const dialog = screen.getByRole('dialog', { name: 'Scrollable form' })
    expect(dialog.parentElement?.parentElement).toBe(document.body)
    expect(document.body).toHaveClass('modal-open')

    rerender(
      <Modal open={false} onClose={vi.fn()} title="Scrollable form">
        <div>Long form content</div>
      </Modal>,
    )

    expect(document.body).not.toHaveClass('modal-open')
  })
})
