import { SafePostListSelect } from "./safe-post-list.dto";
import { SafePostListDTO } from "./safe-post-list.dto";

import { Prisma } from "@prisma/client";

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
 * - 'likes' provides a preview of engagement without requiring another query
 *
 * Design decision:
 * - The likes array contains a lightweight user preview instead of the full User object
 * to:
 * - Prevent sensitive data exposure
 * - Reduce payload size
 * - Improve query performance
 *
 * Scalability note:
 * - 'likes' should always be limited in the service layer (ex: take: 20) to prevent
 * large payloads and DB strain
 *
 * Important:
 * This DTO should only be used for single-post / detail endpoints
 */

export type SafePostDetailDTO = SafePostListDTO & {
  updatedAt: Date;

  likes?: {
    id: number;
    createdAt: Date;

    user: {
      id: number;
      name: string;
      username: string;
    };
  }[];
};

/**
 * Prisma select that matches SafePostDetailDTO exactly
 *
 * Extends the list select and adds:
 * - updatedAt
 * - likes preview (with lightweight user preview)
 */

export const SafePostDetailSelect = {
  ...SafePostListSelect,

  updatedAt: true,

  likes: {
    // IMPORTANT: apply take/orderBy in the query, not in the select constant
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
} satisfies Prisma.PostSelect;
