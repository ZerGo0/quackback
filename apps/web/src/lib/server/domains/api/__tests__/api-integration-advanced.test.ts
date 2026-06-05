/**
 * Advanced API Integration Tests (boundary conditions and voter management)
 *
 * These tests run against a live server and require:
 * 1. Dev server running: `bun run dev`
 * 2. Valid API key in database
 *
 * Run with: API_KEY=qb_xxx bun run test apps/web/src/lib/api/__tests__/api-integration-advanced.test.ts
 *
 * To skip these tests (CI without server): SKIP_INTEGRATION=true bun run test
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import {
  SKIP_INTEGRATION,
  api,
  createTestState,
  checkServerAndSetup,
  cleanupCreatedResources,
} from './api-integration.helpers'

const state = createTestState()

function skipIfNoServer() {
  return !state.serverAvailable
}

describe.skipIf(SKIP_INTEGRATION)('API Integration Tests - Advanced', () => {
  beforeAll(async () => {
    state.serverAvailable = await checkServerAndSetup(state)
  })

  afterAll(async () => {
    if (!state.serverAvailable) return
    await cleanupCreatedResources(state.createdIds)
  })

  describe('Boundary Conditions', () => {
    it('accepts max length title (200 chars)', async () => {
      if (skipIfNoServer() || !state.testBoardId) return

      const { status, data } = await api('POST', '/posts', {
        boardId: state.testBoardId,
        title: 'A'.repeat(200),
        content: 'Test content',
      })
      expect(status).toBe(201)
      state.createdIds.posts.push((data as { data: { id: string } }).data.id)
    })

    it('rejects title exceeding max length', async () => {
      if (skipIfNoServer() || !state.testBoardId) return

      const { status } = await api('POST', '/posts', {
        boardId: state.testBoardId,
        title: 'A'.repeat(201),
        content: 'Test content',
      })
      expect(status).toBe(400)
    })

    it('handles unicode in post title', async () => {
      if (skipIfNoServer() || !state.testBoardId) return

      const { status, data } = await api('POST', '/posts', {
        boardId: state.testBoardId,
        title: '🎉 Unicode Test 日本語 Ñoño',
        content: 'Testing unicode support',
      })
      expect(status).toBe(201)
      state.createdIds.posts.push((data as { data: { id: string } }).data.id)
    })
  })

  describe('Voter Management', () => {
    let voterPrincipalId: string | null = null

    it('POST /posts/:postId/voters requires principalId', async () => {
      if (skipIfNoServer() || !state.testPostId) return

      const { status } = await api('POST', `/posts/${state.testPostId}/voters`, {})
      expect(status).toBe(400)
    })

    it('POST /posts/:postId/voters rejects invalid post ID', async () => {
      if (skipIfNoServer()) return

      const { status } = await api('POST', '/posts/invalid_id/voters', {
        principalId: 'principal_01h455vb4pex5vsknk084sn02q',
      })
      expect(status).toBe(400)
    })

    it('POST /posts/:postId/voters adds a voter', async () => {
      if (skipIfNoServer() || !state.testPostId) return

      // Create a voter via identify endpoint
      const { data: identifyData } = await api('POST', '/users/identify', {
        externalId: `voter-test-${Date.now()}`,
        name: 'Voter Test User',
        email: `voter-test-${Date.now()}@example.com`,
      })
      voterPrincipalId =
        (identifyData as { data: { principalId: string } })?.data?.principalId ?? null
      if (!voterPrincipalId) return

      const { status, data } = await api('POST', `/posts/${state.testPostId}/voters`, {
        principalId: voterPrincipalId,
      })
      expect(status).toBe(200)
      const result = (data as { data: { voted: boolean; voteCount: number } }).data
      expect(result).toHaveProperty('voted')
      expect(result).toHaveProperty('voteCount')
      expect(typeof result.voteCount).toBe('number')
    })

    it('POST /posts/:postId/voters is idempotent', async () => {
      if (skipIfNoServer() || !state.testPostId || !voterPrincipalId) return

      const { status, data } = await api('POST', `/posts/${state.testPostId}/voters`, {
        principalId: voterPrincipalId,
      })
      expect(status).toBe(200)
      const result = (data as { data: { voted: boolean } }).data
      expect(result.voted).toBe(false) // Already voted, no-op
    })

    it('PATCH /posts/:postId/voters/:principalId updates notification level', async () => {
      if (skipIfNoServer() || !state.testPostId || !voterPrincipalId) return

      const { status, data } = await api(
        'PATCH',
        `/posts/${state.testPostId}/voters/${voterPrincipalId}`,
        {
          subscriptionLevel: 'status_only',
        }
      )
      expect(status).toBe(200)
      expect((data as { data: { subscriptionLevel: string } }).data.subscriptionLevel).toBe(
        'status_only'
      )
    })

    it('DELETE /posts/:postId/voters/:principalId removes the voter', async () => {
      if (skipIfNoServer() || !state.testPostId || !voterPrincipalId) return

      const { status, data } = await api(
        'DELETE',
        `/posts/${state.testPostId}/voters/${voterPrincipalId}`
      )
      expect(status).toBe(200)
      expect((data as { data: { removed: boolean } }).data.removed).toBe(true)
    })

    it('DELETE /posts/:postId/voters/:principalId is safe when no vote exists', async () => {
      if (skipIfNoServer() || !state.testPostId || !voterPrincipalId) return

      // Deleting again after already removed
      const { status, data } = await api(
        'DELETE',
        `/posts/${state.testPostId}/voters/${voterPrincipalId}`
      )
      expect(status).toBe(200)
      expect((data as { data: { removed: boolean } }).data.removed).toBe(false)
    })

    it('PATCH /posts/:postId/voters/:principalId requires subscriptionLevel', async () => {
      if (skipIfNoServer() || !state.testPostId || !voterPrincipalId) return

      const { status } = await api(
        'PATCH',
        `/posts/${state.testPostId}/voters/${voterPrincipalId}`,
        {}
      )
      expect(status).toBe(400)
    })

    it('GET /posts/:postId/voters lists voters', async () => {
      if (skipIfNoServer() || !state.testPostId) return

      const { status, data } = await api('GET', `/posts/${state.testPostId}/voters`)
      expect(status).toBe(200)
      expect(Array.isArray((data as { data: unknown[] }).data)).toBe(true)
    })
  })
})
