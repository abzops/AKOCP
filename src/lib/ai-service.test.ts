import { describe, expect, it } from 'vitest'
import type { AiActionProposal, AppSnapshot } from '../types'
import { proposalStaleReason } from './ai-service'

const now = Date.parse('2026-07-26T12:00:00Z')

function snapshot(): AppSnapshot {
  return {
    services: [{
      id: '00000000-0000-4000-8000-000000000001',
      code: 'AU150',
      name: 'Audio Karaoke',
      price: 150,
      active: true,
      sort_order: 1,
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-07-20T00:00:00Z'
    }],
    profiles: [],
    customers: [],
    inventorySummary: { totalAssets: 0, totalRevenue: 0, reusedAssets: 0, topTrack: null, languages: [] },
    orders: [{
      id: '00000000-0000-4000-8000-000000000002',
      order_number: 'AK-1',
      customer_id: '00000000-0000-4000-8000-000000000003',
      service_id: '00000000-0000-4000-8000-000000000001',
      track_name: 'Test song',
      language: 'Malayalam',
      status: 'in_progress',
      payment_status: 'confirmed',
      price: 150,
      created_by: '00000000-0000-4000-8000-000000000004',
      created_at: '2026-07-20T00:00:00Z',
      updated_at: '2026-07-25T00:00:00Z'
    }],
    recordedSales: [],
    payments: [],
    expenses: [],
    withdrawals: [],
    notifications: [],
    auditLogs: [],
    walletTransactions: [],
    monthlyTarget: null,
    syncedAt: '2026-07-26T11:59:00Z'
  }
}

function proposal(overrides: Partial<AiActionProposal> = {}): AiActionProposal {
  return {
    id: '00000000-0000-4000-8000-000000000010',
    conversation_id: '00000000-0000-4000-8000-000000000011',
    requested_by: '00000000-0000-4000-8000-000000000004',
    action_type: 'deliver_order',
    payload: { orderId: '00000000-0000-4000-8000-000000000002' },
    risk_level: 'high',
    preconditions: {
      order: {
        id: '00000000-0000-4000-8000-000000000002',
        status: 'in_progress',
        payment_status: 'confirmed',
        updated_at: '2026-07-25T00:00:00Z'
      }
    },
    status: 'pending',
    expires_at: '2026-07-26T12:15:00Z',
    created_at: '2026-07-26T12:00:00Z',
    ...overrides
  }
}

describe('AI proposal confirmation guard', () => {
  it('allows a current, unused proposal', () => {
    expect(proposalStaleReason(proposal(), snapshot(), now)).toBeNull()
  })

  it('rejects an expired proposal', () => {
    expect(proposalStaleReason(proposal({ expires_at: '2026-07-26T11:59:59Z' }), snapshot(), now)).toMatch(/expired/i)
  })

  it('rejects a proposal that was already used', () => {
    expect(proposalStaleReason(proposal({ status: 'confirmed' }), snapshot(), now)).toMatch(/already confirmed/i)
  })

  it('rejects a proposal when its record changed', () => {
    const current = snapshot()
    current.orders[0].status = 'completed'
    current.orders[0].updated_at = '2026-07-26T11:00:00Z'
    expect(proposalStaleReason(proposal(), current, now)).toMatch(/order changed/i)
  })

  it('protects the controlled service snapshot on order creation', () => {
    const current = snapshot()
    current.services[0].price = 250
    const create = proposal({
      action_type: 'create_order',
      payload: { serviceId: '00000000-0000-4000-8000-000000000001' },
      preconditions: {
        service: {
          id: '00000000-0000-4000-8000-000000000001',
          price: 150,
          active: true,
          updated_at: '2026-07-20T00:00:00Z'
        }
      }
    })
    expect(proposalStaleReason(create, current, now)).toMatch(/service changed/i)
  })
})
