import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { PostId, PrincipalId } from '@quackback/ids'

const mockWithApiKeyAuth = vi.fn()
const mockGetPostVoters = vi.fn()
const mockAddVoteOnBehalf = vi.fn()
const mockRemoveVote = vi.fn()
const mockUpdateVoterSubscriptionLevel = vi.fn()
const mockCreateActivity = vi.fn()

vi.mock('@tanstack/react-router', () => ({
  createFileRoute: vi.fn(() => (opts: unknown) => ({ options: opts })),
}))
vi.mock('@/lib/server/domains/api/auth', () => ({
  withApiKeyAuth: (...args: unknown[]) => mockWithApiKeyAuth(...args),
}))
vi.mock('@/lib/server/domains/posts/post.voting', () => ({
  getPostVoters: (...args: unknown[]) => mockGetPostVoters(...args),
  addVoteOnBehalf: (...args: unknown[]) => mockAddVoteOnBehalf(...args),
  removeVote: (...args: unknown[]) => mockRemoveVote(...args),
}))
vi.mock('@/lib/server/domains/subscriptions/subscription.service', () => ({
  updateVoterSubscriptionLevel: (...args: unknown[]) => mockUpdateVoterSubscriptionLevel(...args),
}))
vi.mock('@/lib/server/domains/activity/activity.service', () => ({
  createActivity: (...args: unknown[]) => mockCreateActivity(...args),
}))

import { Route as VotersRoute } from '../$postId.voters'
import { Route as VoterRoute } from '../$postId.voters.$principalId'

type VotersRouteOpts = {
  server: {
    handlers: {
      GET: (...args: unknown[]) => Promise<Response>
      POST: (...args: unknown[]) => Promise<Response>
    }
  }
}
type VoterRouteOpts = {
  server: {
    handlers: {
      PATCH: (...args: unknown[]) => Promise<Response>
      DELETE: (...args: unknown[]) => Promise<Response>
    }
  }
}

const votersHandlers = (VotersRoute as unknown as { options: VotersRouteOpts }).options.server
  .handlers
const voterHandlers = (VoterRoute as unknown as { options: VoterRouteOpts }).options.server.handlers

const POST_ID = 'post_01kqhxq697fvgat0h1abc12345' as unknown as PostId
const VOTER_PRINCIPAL_ID = 'principal_01kqhxq697fvgat0fvps13rmy2' as unknown as PrincipalId
const ACTOR_PRINCIPAL_ID = 'principal_01kqhxq697fvgat0fn8rr1r7ew' as unknown as PrincipalId

function makeRequest(method: string, body?: Record<string, unknown>): Request {
  return new Request(`http://test/api/v1/posts/${POST_ID}/voters`, {
    method,
    headers: { 'content-type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  })
}

describe('/api/v1/posts/:postId/voters', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockWithApiKeyAuth.mockResolvedValue({
      principalId: ACTOR_PRINCIPAL_ID,
      role: 'admin',
      importMode: false,
    })
    mockGetPostVoters.mockResolvedValue([])
    mockAddVoteOnBehalf.mockResolvedValue({ voted: true, voteCount: 3 })
    mockRemoveVote.mockResolvedValue({ removed: true, voteCount: 2 })
    mockUpdateVoterSubscriptionLevel.mockResolvedValue(undefined)
  })

  it('lists voters and serializes createdAt dates', async () => {
    mockGetPostVoters.mockResolvedValue([
      {
        principalId: VOTER_PRINCIPAL_ID,
        displayName: 'Jane',
        email: 'jane@example.com',
        avatarUrl: null,
        isAnonymous: false,
        sourceType: 'proxy',
        sourceExternalUrl: null,
        addedByName: 'Admin',
        subscriptionLevel: 'all',
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
      },
    ])

    const res = await votersHandlers.GET({
      request: makeRequest('GET'),
      params: { postId: POST_ID },
    })

    expect(res.status).toBe(200)
    expect(mockGetPostVoters).toHaveBeenCalledWith(POST_ID)
    const json = await res.json()
    expect(json.data[0].createdAt).toBe('2026-01-01T00:00:00.000Z')
  })

  it('requires principalId when adding a voter', async () => {
    const res = await votersHandlers.POST({
      request: makeRequest('POST', {}),
      params: { postId: POST_ID },
    })

    expect(res.status).toBe(400)
    expect(mockAddVoteOnBehalf).not.toHaveBeenCalled()
  })

  it('passes createdAt through for admin API keys', async () => {
    const createdAt = '2026-02-03T04:05:06.000Z'

    const res = await votersHandlers.POST({
      request: makeRequest('POST', { principalId: VOTER_PRINCIPAL_ID, createdAt }),
      params: { postId: POST_ID },
    })

    expect(res.status).toBe(200)
    expect(mockAddVoteOnBehalf).toHaveBeenCalledWith(
      POST_ID,
      VOTER_PRINCIPAL_ID,
      { type: 'proxy', externalUrl: '' },
      null,
      ACTOR_PRINCIPAL_ID,
      new Date(createdAt)
    )
  })

  it('ignores createdAt for member API keys', async () => {
    mockWithApiKeyAuth.mockResolvedValue({
      principalId: ACTOR_PRINCIPAL_ID,
      role: 'member',
      importMode: false,
    })

    await votersHandlers.POST({
      request: makeRequest('POST', {
        principalId: VOTER_PRINCIPAL_ID,
        createdAt: '2026-02-03T04:05:06.000Z',
      }),
      params: { postId: POST_ID },
    })

    expect(mockAddVoteOnBehalf.mock.calls[0][5]).toBeUndefined()
  })

  it('suppresses add-voter activity in import mode', async () => {
    mockWithApiKeyAuth.mockResolvedValue({
      principalId: ACTOR_PRINCIPAL_ID,
      role: 'admin',
      importMode: true,
    })

    await votersHandlers.POST({
      request: makeRequest('POST', { principalId: VOTER_PRINCIPAL_ID }),
      params: { postId: POST_ID },
    })

    expect(mockCreateActivity).not.toHaveBeenCalled()
  })

  it('updates a voter subscription level by path principal ID', async () => {
    const res = await voterHandlers.PATCH({
      request: makeRequest('PATCH', { subscriptionLevel: 'status_only' }),
      params: { postId: POST_ID, principalId: VOTER_PRINCIPAL_ID },
    })

    expect(res.status).toBe(200)
    expect(mockUpdateVoterSubscriptionLevel).toHaveBeenCalledWith(
      VOTER_PRINCIPAL_ID,
      POST_ID,
      'status_only'
    )
  })

  it('removes a voter by path principal ID', async () => {
    const res = await voterHandlers.DELETE({
      request: makeRequest('DELETE'),
      params: { postId: POST_ID, principalId: VOTER_PRINCIPAL_ID },
    })

    expect(res.status).toBe(200)
    expect(mockRemoveVote).toHaveBeenCalledWith(POST_ID, VOTER_PRINCIPAL_ID)
    expect(mockCreateActivity).toHaveBeenCalledWith({
      postId: POST_ID,
      principalId: ACTOR_PRINCIPAL_ID,
      type: 'vote.removed',
      metadata: { voterPrincipalId: VOTER_PRINCIPAL_ID },
    })
  })
})
