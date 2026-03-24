import type { Prisma } from "@prisma/client";

/**
 * Internal like DTO and Prisma select
 *
 * Defines the safe like shape used by services
 */

export type LikeDetailDTO = {
  id: number;
  createdAt: Date;

  user: {
    id: number;
    name: string;
    username: string;
  };

  post: {
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
};

/**
 * Prisma select shape that matches LikeDetailDTO
 *
 * Why:
 * - Guarantees service output matches DTO
 * - Prevents accidental field leaks
 * - Keeps return types strongly typed
 * - Improves long-term maintainability
 */

export const LikeDetailSelect = {
  id: true,
  createdAt: true,

  user: {
    select: {
      id: true,
      name: true,
      username: true,
    },
  },

  post: {
    select: {
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
    },
  },
} satisfies Prisma.LikeSelect;
