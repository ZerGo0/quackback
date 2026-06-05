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
import { addVoteOnBehalf, getPostVoters } from '@/lib/server/domains/posts/post.voting'
import type { PostId, PrincipalId } from '@quackback/ids'

const addVoterSchema = z.object({
  principalId: z.string().min(1, 'Principal ID is required'),
  createdAt: z.string().datetime().optional(),
})

export const Route = createFileRoute('/api/v1/posts/$postId/voters')({
  server: {
    handlers: {
      /**
       * GET /api/v1/posts/:postId/voters
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
       * POST /api/v1/posts/:postId/voters
       * Add a voter to a post without toggling existing votes.
       */
      POST: async ({ request, params }) => {
        try {
          const auth = await withApiKeyAuth(request, { role: 'team' })
          const postId = parseTypeId<PostId>(params.postId, 'post', 'post ID')

          const body = await request.json().catch(() => null)
          const parsed = addVoterSchema.safeParse(body)
          if (!parsed.success) {
            return badRequestResponse('Invalid request body', {
              errors: parsed.error.flatten().fieldErrors,
            })
          }

          const voterPrincipalId = parseTypeId<PrincipalId>(
            parsed.data.principalId,
            'principal',
            'principal ID'
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
    },
  },
})
