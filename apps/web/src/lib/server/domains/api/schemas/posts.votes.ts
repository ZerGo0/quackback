/**
 * Posts Votes API Schema Registrations
 */
import 'zod-openapi'
import { z } from 'zod'
import { registerPath, TypeIdSchema, createItemResponseSchema, asSchema } from '../openapi'
import { UnauthorizedErrorSchema, NotFoundErrorSchema, ValidationErrorSchema } from './common'

// Response schema
const VoteResultSchema = z
  .object({
    voted: z.boolean().meta({ description: 'Whether the post is now voted' }),
    voteCount: z.number().meta({ description: 'Current vote count' }),
  })
  .meta({ description: 'Vote result' })

// Register POST /posts/{postId}/vote
registerPath('/posts/{postId}/vote', {
  post: {
    tags: ['Votes'],
    summary: 'Toggle vote on a post',
    description: 'Vote or unvote on a post (toggle)',
    parameters: [
      {
        name: 'postId',
        in: 'path',
        required: true,
        schema: { type: 'string' },
        description: 'Post ID',
      },
    ],
    responses: {
      200: {
        description: 'Vote toggled',
        content: {
          'application/json': {
            schema: createItemResponseSchema(VoteResultSchema, 'Vote result'),
          },
        },
      },
      401: {
        description: 'Unauthorized',
        content: { 'application/json': { schema: UnauthorizedErrorSchema } },
      },
      404: {
        description: 'Post not found',
        content: { 'application/json': { schema: NotFoundErrorSchema } },
      },
    },
  },
})

const SubscriptionLevelSchema = z.enum(['all', 'status_only', 'none'])

const VoterSchema = z
  .object({
    principalId: TypeIdSchema.meta({ description: 'Principal ID of the voter' }),
    displayName: z.string().nullable().meta({ description: "Voter's display name" }),
    email: z.string().email().nullable().meta({ description: "Voter's email address" }),
    avatarUrl: z.string().nullable().meta({ description: "Voter's avatar URL" }),
    isAnonymous: z.boolean().meta({ description: 'Whether this voter is anonymous' }),
    sourceType: z.string().nullable().meta({ description: 'Vote source type, when available' }),
    sourceExternalUrl: z
      .string()
      .nullable()
      .meta({ description: 'External source URL, when available' }),
    addedByName: z
      .string()
      .nullable()
      .meta({ description: 'Name of the team member who added this voter' }),
    subscriptionLevel: SubscriptionLevelSchema.meta({
      description: "Voter's notification level for this post",
    }),
    createdAt: z.string().datetime().meta({ description: 'When the vote was created' }),
  })
  .meta({ description: 'Post voter' })

const AddVoterBodySchema = z
  .object({
    principalId: TypeIdSchema.meta({ description: 'Principal ID of the voter to add' }),
    createdAt: z
      .string()
      .datetime()
      .optional()
      .meta({ description: 'Vote creation time. Only admin API keys can set this.' }),
  })
  .meta({ description: 'Add voter request body' })

const RemoveVoterResultSchema = z
  .object({
    removed: z.boolean().meta({ description: 'Whether a vote was removed' }),
    voteCount: z.number().meta({ description: 'Current vote count' }),
  })
  .meta({ description: 'Remove voter result' })

const UpdateVoterBodySchema = z
  .object({
    subscriptionLevel: SubscriptionLevelSchema.meta({
      description: "Voter's new notification level for this post",
    }),
  })
  .meta({ description: 'Update voter request body' })

const UpdateVoterResultSchema = z
  .object({
    postId: TypeIdSchema,
    principalId: TypeIdSchema,
    subscriptionLevel: SubscriptionLevelSchema,
  })
  .meta({ description: 'Updated voter notification level' })

registerPath('/posts/{postId}/voters', {
  get: {
    tags: ['Votes'],
    summary: 'List post voters',
    description: 'List the voters for a post, including source attribution and notification level.',
    parameters: [
      {
        name: 'postId',
        in: 'path',
        required: true,
        schema: { type: 'string' },
        description: 'Post ID',
      },
    ],
    responses: {
      200: {
        description: 'Post voters',
        content: {
          'application/json': {
            schema: asSchema(z.object({ data: z.array(VoterSchema) })),
          },
        },
      },
      401: {
        description: 'Unauthorized',
        content: { 'application/json': { schema: UnauthorizedErrorSchema } },
      },
      404: {
        description: 'Post not found',
        content: { 'application/json': { schema: NotFoundErrorSchema } },
      },
    },
  },
  post: {
    tags: ['Votes'],
    summary: 'Add a voter',
    description:
      'Add a voter to a post (insert-only, never toggles). Requires team role. createdAt is accepted for admin API keys only.',
    parameters: [
      {
        name: 'postId',
        in: 'path',
        required: true,
        schema: { type: 'string' },
        description: 'Post ID',
      },
    ],
    requestBody: {
      required: true,
      content: { 'application/json': { schema: asSchema(AddVoterBodySchema) } },
    },
    responses: {
      200: {
        description: 'Voter added',
        content: {
          'application/json': {
            schema: createItemResponseSchema(VoteResultSchema, 'Vote result'),
          },
        },
      },
      400: {
        description: 'Validation error',
        content: { 'application/json': { schema: ValidationErrorSchema } },
      },
      401: {
        description: 'Unauthorized',
        content: { 'application/json': { schema: UnauthorizedErrorSchema } },
      },
      404: {
        description: 'Post not found',
        content: { 'application/json': { schema: NotFoundErrorSchema } },
      },
    },
  },
})

registerPath('/posts/{postId}/voters/{principalId}', {
  patch: {
    tags: ['Votes'],
    summary: 'Update voter notification level',
    description: "Update a voter's notification level for a post. Requires team role.",
    parameters: [
      {
        name: 'postId',
        in: 'path',
        required: true,
        schema: { type: 'string' },
        description: 'Post ID',
      },
      {
        name: 'principalId',
        in: 'path',
        required: true,
        schema: { type: 'string' },
        description: 'Voter principal ID',
      },
    ],
    requestBody: {
      required: true,
      content: { 'application/json': { schema: asSchema(UpdateVoterBodySchema) } },
    },
    responses: {
      200: {
        description: 'Voter notification level updated',
        content: {
          'application/json': {
            schema: createItemResponseSchema(UpdateVoterResultSchema, 'Updated voter'),
          },
        },
      },
      400: {
        description: 'Validation error',
        content: { 'application/json': { schema: ValidationErrorSchema } },
      },
      401: {
        description: 'Unauthorized',
        content: { 'application/json': { schema: UnauthorizedErrorSchema } },
      },
      404: {
        description: 'Post or voter not found',
        content: { 'application/json': { schema: NotFoundErrorSchema } },
      },
    },
  },
  delete: {
    tags: ['Votes'],
    summary: 'Remove a voter',
    description: 'Remove any vote for a voter on a post. Requires team role.',
    parameters: [
      {
        name: 'postId',
        in: 'path',
        required: true,
        schema: { type: 'string' },
        description: 'Post ID',
      },
      {
        name: 'principalId',
        in: 'path',
        required: true,
        schema: { type: 'string' },
        description: 'Voter principal ID',
      },
    ],
    responses: {
      200: {
        description: 'Voter removed',
        content: {
          'application/json': {
            schema: createItemResponseSchema(RemoveVoterResultSchema, 'Remove voter result'),
          },
        },
      },
      401: {
        description: 'Unauthorized',
        content: { 'application/json': { schema: UnauthorizedErrorSchema } },
      },
      404: {
        description: 'Post not found',
        content: { 'application/json': { schema: NotFoundErrorSchema } },
      },
    },
  },
})
