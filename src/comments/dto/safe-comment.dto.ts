import type { Prisma } from "@prisma/client";

/**
 * Internal DTO used by the comments service layer
 *
 * What it does:
 * - defines the exact safe data shape returned from Prisma queries
 * - keeps service-layer types aligned with the Prisma select below
 * - separates internal data contracts from GraphQL ObjectType definitions
 */

export type SafeCommentDTO = {
  id: number;
  content: string;
  createdAt: Date;
  updatedAt: Date;
  authorId: number;
  postId: number;
  author: {
    id: number;
    name: string;
    username: string;
  };
};

/**
 * Safe Prisma select used to return only the comment fields that are
 * allowed to be exposed by the API
 */

export const SafeCommentSelect = {
  id: true,
  content: true,
  createdAt: true,
  updatedAt: true,
  authorId: true,
  postId: true,
  author: {
    select: {
      id: true,
      name: true,
      username: true,
    },
  },
} as const satisfies Prisma.CommentSelect;
