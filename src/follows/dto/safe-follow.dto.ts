import type { SafeUserPreview } from "@/users/models/safe-user-preview.model";

import type { Prisma } from "@prisma/client";

/** Safe DTO shape for a Follow relationship with user previews. */
export type SafeFollowDTO = {
  id: number;
  createdAt: Date;

  followerId: number;
  followingId: number;

  follower: SafeUserPreview;
  following: SafeUserPreview;
};

/** Prisma select shape for SafeFollowDTO. */
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
