import type { SafeCommentDTO } from "@/comments/dto/safe-comment.dto";
import { SafeCommentSelect } from "@/comments/dto/safe-comment.dto";

import type { SafePostListDTO } from "@/posts/dto/safe-post-list.dto";
import { SafePostListSelect } from "@/posts/dto/safe-post-list.dto";

import type { Prisma } from "@prisma/client";

/**
 * Internal post detail DTO and Prisma select
 *
 * Defines the safe post detail shape used by services
 */

export type SafePostDetailDTO = SafePostListDTO & {
  updatedAt: Date;
  viewsCount: number;

  _count: SafePostListDTO["_count"];

  likes?: {
    id: number;
    createdAt: Date;

    user: {
      id: number;
      name: string;
      username: string;
    };
  }[];

  comments?: SafeCommentDTO[];
};

/**
 * Prisma select that matches SafePostDetailDTO exactly
 *
 * Extends the list select and adds:
 * - updatedAt
 * - viewsCount
 * - comments count
 * - likes preview
 * - comments preview
 */

export const SafePostDetailSelect = {
  ...SafePostListSelect,

  updatedAt: true,
  viewsCount: true,

  _count: {
    select: {
      likes: true,
      comments: true,
    },
  },

  likes: {
    select: {
      id: true,
      createdAt: true,

      user: {
        select: {
          id: true,
          name: true,
          username: true,
        },
      },
    },
  },

  comments: {
    orderBy: {
      createdAt: "desc",
    },

    select: SafeCommentSelect,
  },
} as const satisfies Prisma.PostSelect;
