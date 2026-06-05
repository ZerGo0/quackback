import { createFileRoute } from '@tanstack/react-router'
import { z } from 'zod'
import { createActivity } from '@/lib/server/domains/activity/activity.service'
import { withApiKeyAuth } from '@/lib/server/domains/api/auth'
import {
  badRequestResponse,
  handleDomainError,
  noContentResponse,
  successResponse,
} from '@/lib/server/domains/api/responses'
import { parseTypeId } from '@/lib/server/domains/api/validation'
import { addVoteOnBehalf, getPostVoters, removeVote } from '@/lib/server/domains/posts/post.voting'
import { updateVoterSubscriptionLevel } from '@/lib/server/domains/subscriptions/subscription.service'
import type { PostId, PrincipalId } from '@quackback/ids'
import type { SubscriptionLevel } from '@/lib/server/domains/subscriptions/subscription.types'

const proxyVoteSchema = z.object({
  voterPrincipalId: z.string().min(1, 'Voter principal ID is required'),
  createdAt: z.string().datetime().optional(),
})

const updateProxyVoteSchema = z.object({
  voterPrincipalId: z.string().min(1, 'Voter principal ID is required'),
  subscriptionLevel: z.enum(['all', 'status_only', 'none']),
})

export const Route = createFileRoute('/api/v1/posts/$postId/vote/proxy')({
  server: {
    handlers: {
      /**
       * GET /api/v1/posts/:postId/vote/proxy
       * List voters for a post.
       */
      GET: async ({ request, params }) => {
        try {
          await withApiKeyAuth(request, { role: 'team' })
          const postId = parseTypeId<PostId>(params.postId, 'post', 'post ID')
          const voters = await getPostVoters(postId)

          return successResponse(
            voters.map((voter) => ({
              principalId: voter.principalId,
              displayName: voter.displayName,
              email: voter.email,
              avatarUrl: voter.avatarUrl,
              isAnonymous: voter.isAnonymous,
              sourceType: voter.sourceType,
              sourceExternalUrl: voter.sourceExternalUrl,
              addedByName: voter.addedByName,
              subscriptionLevel: voter.subscriptionLevel,
              createdAt:
                voter.createdAt instanceof Date ? voter.createdAt.toISOString() : voter.createdAt,
            }))
          )
        } catch (error) {
          return handleDomainError(error)
        }
      },

      /**
       * POST /api/v1/posts/:postId/vote/proxy
       * Add a proxy vote on behalf of a user (insert-only, never toggles).
       */
      POST: async ({ request, params }) => {
        try {
          const auth = await withApiKeyAuth(request, { role: 'team' })
          const postId = parseTypeId<PostId>(params.postId, 'post', 'post ID')

          const body = await request.json().catch(() => null)
          const parsed = proxyVoteSchema.safeParse(body)
          if (!parsed.success) {
            return badRequestResponse('Invalid request body', {
              errors: parsed.error.flatten().fieldErrors,
            })
          }

          const voterPrincipalId = parseTypeId<PrincipalId>(
            parsed.data.voterPrincipalId,
            'principal',
            'voter principal ID'
          )
          const createdAt =
            parsed.data.createdAt && auth.role === 'admin'
              ? new Date(parsed.data.createdAt)
              : undefined

          const result = await addVoteOnBehalf(
            postId,
            voterPrincipalId,
            { type: 'proxy', externalUrl: '' },
            null,
            auth.principalId,
            createdAt
          )

          if (result.voted && !auth.importMode) {
            void createActivity({
              postId,
              principalId: auth.principalId,
              type: 'vote.proxy',
              metadata: { voterPrincipalId },
            })
          }

          return successResponse({
            voted: result.voted,
            voteCount: result.voteCount,
          })
        } catch (error) {
          return handleDomainError(error)
        }
      },

      /**
       * PATCH /api/v1/posts/:postId/vote/proxy
       * Update a voter's notification level.
       */
      PATCH: async ({ request, params }) => {
        try {
          await withApiKeyAuth(request, { role: 'team' })
          const postId = parseTypeId<PostId>(params.postId, 'post', 'post ID')

          const body = await request.json().catch(() => null)
          const parsed = updateProxyVoteSchema.safeParse(body)
          if (!parsed.success) {
            return badRequestResponse('Invalid request body', {
              errors: parsed.error.flatten().fieldErrors,
            })
          }

          const voterPrincipalId = parseTypeId<PrincipalId>(
            parsed.data.voterPrincipalId,
            'principal',
            'voter principal ID'
          )
          const subscriptionLevel = parsed.data.subscriptionLevel as SubscriptionLevel
          await updateVoterSubscriptionLevel(voterPrincipalId, postId, subscriptionLevel)

          return successResponse({
            postId,
            principalId: voterPrincipalId,
            subscriptionLevel,
          })
        } catch (error) {
          return handleDomainError(error)
        }
      },

      /**
       * DELETE /api/v1/posts/:postId/vote/proxy
       * Remove a vote on behalf of a user.
       */
      DELETE: async ({ request, params }) => {
        try {
          const auth = await withApiKeyAuth(request, { role: 'team' })
          const postId = parseTypeId<PostId>(params.postId, 'post', 'post ID')

          const body = await request.json().catch(() => null)
          const parsed = proxyVoteSchema.safeParse(body)
          if (!parsed.success) {
            return badRequestResponse('Invalid request body', {
              errors: parsed.error.flatten().fieldErrors,
            })
          }

          const voterPrincipalId = parseTypeId<PrincipalId>(
            parsed.data.voterPrincipalId,
            'principal',
            'voter principal ID'
          )

          const result = await removeVote(postId, voterPrincipalId)

          if (result.removed && !auth.importMode) {
            void createActivity({
              postId,
              principalId: auth.principalId,
              type: 'vote.removed',
              metadata: { voterPrincipalId },
            })
          }

          return noContentResponse()
        } catch (error) {
          return handleDomainError(error)
        }
      },
    },
  },
})
