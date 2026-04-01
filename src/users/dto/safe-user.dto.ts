import type { Prisma } from "@prisma/client";

/** Defines the safe user shape used by services */
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

/** Keeps database reads aligned with the safe response shape */
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
