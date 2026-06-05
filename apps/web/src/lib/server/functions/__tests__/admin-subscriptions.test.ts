import { describe, it, expect, vi, beforeEach } from 'vitest'

// --- Mock: capture handlers registered via createServerFn ---

type AnyHandler = (args: { data: Record<string, unknown> }) => Promise<unknown>

const handlersByIndex: AnyHandler[] = []

vi.mock('@tanstack/react-start', () => ({
  createServerFn: () => {
    const chain = {
      inputValidator() {
        return chain
      },
      handler(fn: AnyHandler) {
        handlersByIndex.push(fn)
        return chain
      },
    }
    return chain
  },
}))

// --- Mock: auth helpers ---

const mockRequireAuth = vi.fn()

vi.mock('@/lib/server/functions/auth-helpers', () => ({
  requireAuth: (...args: unknown[]) => mockRequireAuth(...args),
}))

// --- Mock: subscription service ---

const mockUpdateVoterSubscriptionLevel = vi.fn()

vi.mock('@/lib/server/domains/subscriptions/subscription.service', () => ({
  getSubscriptionStatus: vi.fn(),
  updateVoterSubscriptionLevel: (...args: unknown[]) => mockUpdateVoterSubscriptionLevel(...args),
  processUnsubscribeToken: vi.fn(),
}))

// --- Handler setup ---

// Handler indices match declaration order in subscriptions.ts:
// 0: fetchSubscriptionStatus, 1: subscribeToPostFn, 2: unsubscribeFromPostFn,
// 3: updateSubscriptionLevelFn, 4: adminUpdateVoterSubscriptionFn,
// 5: processUnsubscribeTokenFn
const HANDLER_INDEX = 4

let handler: AnyHandler

beforeEach(async () => {
  vi.clearAllMocks()
  mockUpdateVoterSubscriptionLevel.mockReset()
  mockUpdateVoterSubscriptionLevel.mockResolvedValue(undefined)
  if (handlersByIndex.length === 0) {
    await import('../subscriptions')
  }
  handler = handlersByIndex[HANDLER_INDEX]
})

describe('adminUpdateVoterSubscriptionFn', () => {
  const validData = {
    postId: 'post_abc123',
    principalId: 'principal_xyz456',
    level: 'status_only',
  }

  it('rejects requests rejected by the voter subscription helper', async () => {
    mockRequireAuth.mockResolvedValue({ principalId: 'admin_principal' })
    mockUpdateVoterSubscriptionLevel.mockRejectedValue(
      new Error('Principal does not have a vote on this post')
    )

    await expect(handler({ data: validData })).rejects.toThrow(
      'Principal does not have a vote on this post'
    )
  })

  it('delegates status_only updates to the shared voter subscription helper', async () => {
    mockRequireAuth.mockResolvedValue({ principalId: 'admin_principal' })

    await handler({ data: validData })

    expect(mockUpdateVoterSubscriptionLevel).toHaveBeenCalledWith(
      'principal_xyz456',
      'post_abc123',
      'status_only'
    )
  })

  it('delegates none updates to the shared voter subscription helper', async () => {
    mockRequireAuth.mockResolvedValue({ principalId: 'admin_principal' })

    await handler({ data: { ...validData, level: 'none' } })

    expect(mockUpdateVoterSubscriptionLevel).toHaveBeenCalledWith(
      'principal_xyz456',
      'post_abc123',
      'none'
    )
  })

  it('delegates all updates to the shared voter subscription helper', async () => {
    mockRequireAuth.mockResolvedValue({ principalId: 'admin_principal' })

    await handler({ data: { ...validData, level: 'all' } })

    expect(mockUpdateVoterSubscriptionLevel).toHaveBeenCalledWith(
      'principal_xyz456',
      'post_abc123',
      'all'
    )
  })

  it('returns the updated subscription data on success', async () => {
    mockRequireAuth.mockResolvedValue({ principalId: 'admin_principal' })

    const result = await handler({ data: validData })

    expect(result).toEqual({
      postId: 'post_abc123',
      principalId: 'principal_xyz456',
      level: 'status_only',
    })
  })
})
