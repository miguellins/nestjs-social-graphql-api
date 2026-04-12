import { UserPrivacySetting } from "@/users/enums/user-privacy-setting.enum";
import { AccountState } from "@/users/enums/account-state.enum";

import type { Prisma } from "@prisma/client";

/** Defines the safe user shape used by services. */
export type SafeUserDTO = {
  id: number;
  name: string;
  username: string;
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

/** Defines the Prisma select shape that keeps database reads aligned with the safe user DTO. */
export const SafeUserSelect = {
  id: true,
  name: true,
  username: true,
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
