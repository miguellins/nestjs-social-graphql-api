/**
 * Internal DTO representing a fully hydrated Like
 *
 * What it does:
 * - Defines the exact data shape returned by the Like service layer
 * - Prevents exposing raw Prisma models directly to resolvers
 * - Guarantees type consistency between service and GraphQL layer
 * - Enforces a controlled projection of related entities
 *
 * Security layer:
 * - Only safe user fields are exposed (id, name, username)
 * - Never exposes email and password
 * - Prevents accidental data leakage from nested relations
 *
 * Architecture principle:
 * Service returns DTOs - resolver maps to GraphQL ObjectTypes
 * Never return raw Prisma entities directly
 *
 * Design philosophy:
 * This DTO represents a detailed Like view:
 * - Like metadata
 * - Minimal user info (who liked)
 * - Minimal post snapshot (what was liked)
 * - Post author preview
 * - Aggregated like count
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
    };
  };
};
