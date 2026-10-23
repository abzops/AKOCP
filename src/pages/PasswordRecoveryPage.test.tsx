import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { PasswordRecoveryPage } from './PasswordRecoveryPage'

const auth = vi.hoisted(() => ({ session: { user: { id: 'test-user' } }, updatePassword: vi.fn(), signOut: vi.fn() }))
vi.mock('../context/AuthContext', () => ({ useAuth: () => auth }))
afterEach(() => { cleanup(); vi.clearAllMocks() })

describe('password recovery', () => {
  it('does not submit mismatched passwords', async () => {
    render(<PasswordRecoveryPage />)
    fireEvent.change(screen.getByLabelText(/^New password/), { target: { value: 'test-password-123' } })
    fireEvent.change(screen.getByLabelText(/^Confirm password/), { target: { value: 'different-password' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save password' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('do not match')
    expect(auth.updatePassword).not.toHaveBeenCalled()
  })
  it('submits matching passwords through the authenticated recovery workflow', async () => {
    auth.updatePassword.mockResolvedValue(undefined)
    render(<PasswordRecoveryPage />)
    fireEvent.change(screen.getByLabelText(/^New password/), { target: { value: 'test-password-123' } })
    fireEvent.change(screen.getByLabelText(/^Confirm password/), { target: { value: 'test-password-123' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save password' }))
    await waitFor(() => expect(auth.updatePassword).toHaveBeenCalledWith('test-password-123'))
  })
})
