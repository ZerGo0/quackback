import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { PrincipalId } from '@quackback/ids'

const mockWithApiKeyAuth = vi.fn()
const mockCreatePortalUser = vi.fn()
const mockListPortalUsers = vi.fn()
const mockParseUserAttributes = vi.fn()

vi.mock('@tanstack/react-router', () => ({
  createFileRoute: vi.fn(() => (opts: unknown) => ({ options: opts })),
}))
vi.mock('@/lib/server/domains/api/auth', () => ({
  withApiKeyAuth: (...args: unknown[]) => mockWithApiKeyAuth(...args),
}))
vi.mock('@/lib/server/domains/users/user.identify', () => ({
  createPortalUser: (...args: unknown[]) => mockCreatePortalUser(...args),
}))
vi.mock('@/lib/server/domains/users/user.service', () => ({
  listPortalUsers: (...args: unknown[]) => mockListPortalUsers(...args),
}))
vi.mock('@/lib/server/domains/users/user.attributes', () => ({
  parseUserAttributes: (...args: unknown[]) => mockParseUserAttributes(...args),
}))

import { Route } from '../index'

type RouteOpts = {
  server: {
    handlers: {
      POST: (...args: unknown[]) => Promise<Response>
    }
  }
}

const POST = (Route as unknown as { options: RouteOpts }).options.server.handlers.POST
const PRINCIPAL_ID = 'principal_01kqhxq697fvgat0fvps13rmy2' as unknown as PrincipalId

function makeRequest(body: Record<string, unknown>): Request {
  return new Request('http://test/api/v1/users', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

describe('POST /api/v1/users', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockWithApiKeyAuth.mockResolvedValue({ principalId: PRINCIPAL_ID, role: 'admin' })
    mockCreatePortalUser.mockResolvedValue({
      principalId: PRINCIPAL_ID,
      userId: 'user_123',
      name: 'Jane Doe',
      email: null,
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
    })
  })

  it('creates a portal user with a name and optional email', async () => {
    const res = await POST({
      request: makeRequest({ name: 'Jane Doe' }),
    })

    expect(res.status).toBe(201)
    expect(mockWithApiKeyAuth).toHaveBeenCalledWith(expect.any(Request), { role: 'admin' })
    expect(mockCreatePortalUser).toHaveBeenCalledWith({ name: 'Jane Doe' })
    const json = await res.json()
    expect(json.data).toEqual({
      principalId: PRINCIPAL_ID,
      userId: 'user_123',
      name: 'Jane Doe',
      email: null,
      createdAt: '2026-01-01T00:00:00.000Z',
    })
  })

  it('passes optional email through to portal user creation', async () => {
    await POST({
      request: makeRequest({ name: 'Jane Doe', email: 'jane@example.com' }),
    })

    expect(mockCreatePortalUser).toHaveBeenCalledWith({
      name: 'Jane Doe',
      email: 'jane@example.com',
    })
  })

  it('rejects invalid create-user bodies', async () => {
    const res = await POST({
      request: makeRequest({ email: 'not-an-email' }),
    })

    expect(res.status).toBe(400)
    expect(mockCreatePortalUser).not.toHaveBeenCalled()
  })
})
