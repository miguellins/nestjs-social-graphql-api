import type { SafeUserPreview } from "@/users/models/safe-user-preview.model";

import type { Prisma } from "@prisma/client";

/**
 * Internal follow DTO and Prisma select
 *
 * Defines the safe follow shape used by services
 */

/**
 * Safe Follow DTO
 *
 * Defines the exact shape returned by the Follow service
 */

export type SafeFollowDTO = {
  id: number;
  createdAt: Date;

  followerId: number;
  followingId: number;

  follower: SafeUserPreview;
  following: SafeUserPreview;
};

/**
 * Prisma select configuration aligned with SafeFollowDTO
 *
 * Why:
 * - Prevents accidental exposure of sensitive fields
 * - Keeps DTO and database selection synchronized
 * - Enforces compile-time safety using 'satisfies'
 */

export const SafeFollowSelect = {
  id: true,
  createdAt: true,
  followerId: true,
  followingId: true,

  follower: {
    select: {
      id: true,
      name: true,
      username: true,
    },
  },

  following: {
    select: {
      id: true,
      name: true,
      username: true,
    },
  },
} satisfies Prisma.FollowSelect;
