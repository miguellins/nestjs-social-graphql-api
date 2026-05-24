import type { Prisma } from "@prisma/client";

import { PostKind } from "@/posts/enums/post-kind.enum";
import {
  SafePostEmbedSelect,
  type SafePostEmbedDTO,
} from "@/posts/dto/safe-post-embed.dto";

import { UserPrivacySetting } from "@/users/enums/user-privacy-setting.enum";
import { AccountState } from "@/users/enums/account-state.enum";

/** Defines the safe post list shape used by services. */
export type SafePostListDTO = {
  id: number;
  title: string | null;
  content: string;
  kind: PostKind;
  sourcePostId: number | null;
  createdAt: Date;
  likesCount: number;
  commentsCount: number;
  repostsCount: number | null;
  viewerHasReposted: boolean;
  sourcePost?: SafePostEmbedDTO | null;

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
  kind: true,
  sourcePostId: true,
  createdAt: true,
  likesCount: true,
  commentsCount: true,
  repostsCount: true,
  sourcePost: {
    select: SafePostEmbedSelect,
  },

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
