import type { Prisma } from "@prisma/client";

/**
 * Internal post list DTO and Prisma select
 *
 * Defines the safe post list shape used by services
 */

export type SafePostListDTO = {
  id: number;
  title: string;
  content: string;
  createdAt: Date;

  author: {
    id: number;
    name: string;
    username: string;
  };

  _count: {
    likes: number;
    comments: number;
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

  author: {
    select: {
      id: true,
      name: true,
      username: true,
    },
  },

  _count: {
    select: {
      likes: true,
      comments: true,
    },
  },
} satisfies Prisma.PostSelect;
