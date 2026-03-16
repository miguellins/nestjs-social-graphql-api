import { SafeCommentSelect } from "@/comments/dto/safe-comment.dto";
import type { SafeCommentDTO } from "@/comments/dto/safe-comment.dto";
import { SafePostListSelect } from "@/posts/dto/safe-post-list.dto";
import type { SafePostListDTO } from "@/posts/dto/safe-post-list.dto";

import type { Prisma } from "@prisma/client";

/**
 * Extended safe representation of a Post used for detailed views
 *
 * What it does:
 * - Builds on top of SafePostListDTO to avoid duplication
 * - Adds fields required for richer post queries
 * - Maintains a safe contract between the services layer and API
 *
 * Why extend instead of rewrite:
 * - Promotes DRY principle (Dont repeat yourself)
 * - Keeps list and detail responses consistent
 * - Makes future schema changes safer and easier
 *
 * Added fields:
 * - 'updatedAt' helps clients detect edits and refresh caches
 * - 'viewsCount' exposes how many times the post detail was viewed
 * - '_count.comments' exposes the number of related comments
 * - 'likes' provides a preview of engagement without requiring another query
 * - 'comments' provides a lightweight preview of post discussion
 *
 * Design decision:
 * - The likes array contains a lightweight user preview instead of the full User object
 * - The comments array contains a safe nested comment preview
 *
 * Scalability note:
 * - 'likes' and 'comments' should be limited in the service layer when needed prevent
 * large payloads and DB strain
 *
 * Important:
 * This DTO should only be used for single-post / detail endpoints
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
