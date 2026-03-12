import { SafeUserPreview } from "@/users/models/safe-user-preview.model";

import { Prisma } from "@prisma/client";

/**
 * Safe Follow DTO
 *
 * What it does:
 * - Defines the exact shape returned by the Follow service
 * - Prevents leaking sensitive user fields
 * - Establishes a strict contract between service layer and API
 *
 * Why it exists:
 * - Avoids returning raw Prisma Follow model
 * - Prevents exposing full User objects
 * - Keeps relational responses lightweight and predictable
 *
 * Security benefit:
 * - Only SafeUserPreview is returned for follower/following
 * - Never exposes email, password, roles, or internal flags
 *
 * Design philosophy:
 * - Services return DTOs, never raw database models
 * - Always expose the smallest safe shape possible
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
