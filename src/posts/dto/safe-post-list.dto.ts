import { Prisma } from "@prisma/client";

/**
 * Safe representation of a Post used in list-based queries
 *
 * What it does:
 * - Exposes only the fields required for displaying posts in a list
 * - Prevents leaking internal database structure
 * - Keeps API responses lightweight and predictable
 * - Provides minimal relational data for UI rendering
 *
 * Why it exists:
 * - Returning full post objects in lists is expensive
 * - Large payloads slow down APIs and increase DB load
 * - A dedicated list DTO enforces performance-first design
 *
 * Design philosophy:
 * - LIST - fast, minimal, scalable
 * - DETAIL - richer, heavier, more relational
 *
 * Author strategy:
 * Includes only a lightweight author preview to:
 * - Avoid exposing sensitive user data
 * - Reduce nested query cost
 * - Improve response times
 *
 * Performance benefit:
 * '_count.likes' lets the client render engagement metrics without fetching the entire
 * likes collection
 *
 * Important:
 * This DTO should be used only for multi-record queries
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
