import { Prisma } from "@prisma/client";

/**
 * Safe user shape returned by the service layer
 *
 * Excludes sensitive fields such as password and email
 */

export type SafeUserDTO = {
  id: number;
  name: string;
  username: string;
  createdAt: Date;
  updatedAt: Date;

  _count?: {
    likes: number;
    posts: number;
    followers: number;
    following: number;
  };
};

/**
 * Prisma select that matches SafeUserDTO
 *
 * Keeps database reads aligned with the safe response shape
 */

export const SafeUserSelect = {
  id: true,
  name: true,
  username: true,
  createdAt: true,
  updatedAt: true,

  _count: {
    select: {
      likes: true,
      posts: true,
      followers: true,
      following: true,
    },
  },
} satisfies Prisma.UserSelect;
