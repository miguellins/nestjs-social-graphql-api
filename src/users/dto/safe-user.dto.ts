import { UserPrivacySetting } from "@/users/enums/user-privacy-setting.enum";
import { AccountState } from "@/users/enums/account-state.enum";

import { MediaStatus } from "@prisma/client";
import type { Prisma } from "@prisma/client";

/** Defines safe avatar media fields needed to derive public profile image URLs. */
export type SafeUserAvatarMediaDTO = {
  id: number;
  status: MediaStatus;
  objectKey: string;
};

/** Defines the safe user shape used by services. */
export type SafeUserDTO = {
  id: number;
  name: string;
  username: string;
  bio: string | null;
  websiteUrl: string | null;
  location: string | null;
  avatarUrl?: string | null;
  privacySetting: UserPrivacySetting;
  accountState: AccountState;
  isEmailVerified: boolean;
  createdAt: Date;
  updatedAt: Date;

  _count?: {
    likes: number;
    posts: number;
    followers: number;
    following: number;
  };
};

/** Defines the safe current-user profile shape with pending avatar state. */
export type MyProfileDTO = SafeUserDTO & {
  pendingAvatar?: {
    id: number;
    status: MediaStatus;
    avatarUrl: string;
    createdAt: Date;
  } | null;
};

/** Defines the Prisma select shape that keeps database reads aligned with the safe user DTO. */
export const SafeUserSelect = {
  id: true,
  name: true,
  username: true,
  bio: true,
  websiteUrl: true,
  location: true,
  avatarMedia: {
    select: {
      id: true,
      status: true,
      objectKey: true,
    },
  },
  privacySetting: true,
  accountState: true,
  isEmailVerified: true,
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

/** Defines the owner profile select with latest pending avatar upload state. */
export const MyProfileSelect = {
  ...SafeUserSelect,
  media: {
    where: {
      kind: "PROFILE_AVATAR",
      status: "PENDING_UPLOAD",
    },
    orderBy: {
      createdAt: "desc",
    },
    take: 1,
    select: {
      id: true,
      status: true,
      objectKey: true,
      createdAt: true,
    },
  },
} satisfies Prisma.UserSelect;
