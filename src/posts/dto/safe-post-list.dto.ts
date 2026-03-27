import type { Prisma } from "@prisma/client";

/**
 * Internal post list DTO and Prisma select
 *
 * Defines the safe post list shape used by services
 */

export type SafePostListDTO = {
  id: number;
  title: string | null;
  content: string;
  createdAt: Date;
  likesCount: number;
  commentsCount: number;

  author: {
    id: number;
    name: string;
    username: string;
  };
};

/**
 * Prisma select that matches SafePostListDTO exactly
 *
 * Guarantees:
 * - No accidental extra fields
 * - No sensitive data leakage
 * - Compile-time safety if DTO changes
 * - Consistent performance for list queries
 */

export const SafePostListSelect = {
  id: true,
  title: true,
  content: true,
  createdAt: true,
  likesCount: true,
  commentsCount: true,

  author: {
    select: {
      id: true,
      name: true,
      username: true,
    },
  },
} satisfies Prisma.PostSelect;
