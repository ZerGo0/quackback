import { createFileRoute } from '@tanstack/react-router'
import { z } from 'zod'
import { createActivity } from '@/lib/server/domains/activity/activity.service'
import { withApiKeyAuth } from '@/lib/server/domains/api/auth'
import {
  badRequestResponse,
  handleDomainError,
  successResponse,
} from '@/lib/server/domains/api/responses'
import { parseTypeId } from '@/lib/server/domains/api/validation'
import { removeVote } from '@/lib/server/domains/posts/post.voting'
import { updateVoterSubscriptionLevel } from '@/lib/server/domains/subscriptions/subscription.service'
import type { PostId, PrincipalId } from '@quackback/ids'
import type { SubscriptionLevel } from '@/lib/server/domains/subscriptions/subscription.types'

const updateVoterSchema = z.object({
  subscriptionLevel: z.enum(['all', 'status_only', 'none']),
})

export const Route = createFileRoute('/api/v1/posts/$postId/voters/$principalId')({
  server: {
    handlers: {
      /**
       * PATCH /api/v1/posts/:postId/voters/:principalId
       * Update a voter's notification level.
       */
      PATCH: async ({ request, params }) => {
        try {
          await withApiKeyAuth(request, { role: 'team' })
          const postId = parseTypeId<PostId>(params.postId, 'post', 'post ID')
          const principalId = parseTypeId<PrincipalId>(
            params.principalId,
            'principal',
            'principal ID'
          )

          const body = await request.json().catch(() => null)
          const parsed = updateVoterSchema.safeParse(body)
          if (!parsed.success) {
            return badRequestResponse('Invalid request body', {
              errors: parsed.error.flatten().fieldErrors,
            })
          }

          const subscriptionLevel = parsed.data.subscriptionLevel as SubscriptionLevel
          await updateVoterSubscriptionLevel(principalId, postId, subscriptionLevel)

          return successResponse({
            postId,
            principalId,
            subscriptionLevel,
          })
        } catch (error) {
          return handleDomainError(error)
        }
      },

      /**
       * DELETE /api/v1/posts/:postId/voters/:principalId
       * Remove a voter from a post.
       */
      DELETE: async ({ request, params }) => {
        try {
          const auth = await withApiKeyAuth(request, { role: 'team' })
          const postId = parseTypeId<PostId>(params.postId, 'post', 'post ID')
          const principalId = parseTypeId<PrincipalId>(
            params.principalId,
            'principal',
            'principal ID'
          )

          const result = await removeVote(postId, principalId)

          if (result.removed && !auth.importMode) {
            void createActivity({
              postId,
              principalId: auth.principalId,
              type: 'vote.removed',
              metadata: { voterPrincipalId: principalId },
            })
          }

          return successResponse({
            removed: result.removed,
            voteCount: result.voteCount,
          })
        } catch (error) {
          return handleDomainError(error)
        }
      },
    },
  },
})
