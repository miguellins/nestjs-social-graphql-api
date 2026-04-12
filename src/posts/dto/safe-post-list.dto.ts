import type { Prisma } from "@prisma/client";

import { UserPrivacySetting } from "@/users/enums/user-privacy-setting.enum";
import { AccountState } from "@/users/enums/account-state.enum";

/** Defines the safe post list shape used by services. */
export type SafePostListDTO = {
  id: number;
  title: string | null;
  content: string;
  createdAt: Date;
  likesCount: number;
  commentsCount: number;

  author: {
    id: number;
    name: string;
    username: string;
    privacySetting: UserPrivacySetting;
    accountState: AccountState;
  };
};

/** Defines the Prisma select that matches the safe post list DTO shape. */
export const SafePostListSelect = {
  id: true,
  title: true,
  content: true,
  createdAt: true,
  likesCount: true,
  commentsCount: true,

  author: {
    select: {
      id: true,
      name: true,
      username: true,
      privacySetting: true,
      accountState: true,
    },
  },
} satisfies Prisma.PostSelect;
