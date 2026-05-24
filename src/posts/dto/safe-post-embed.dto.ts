import type { Prisma } from "@prisma/client";

import { PostKind } from "@/posts/enums/post-kind.enum";
import type { SafePostMediaAttachmentDTO } from "@/posts/dto/safe-post-detail.dto";

import { UserPrivacySetting } from "@/users/enums/user-privacy-setting.enum";
import { AccountState } from "@/users/enums/account-state.enum";

/** Defines the safe embedded source-post shape exposed inside repost and quote rows. */
export type SafePostEmbedDTO = {
  id: number | null;
  title: string | null;
  content: string | null;
  kind: PostKind | null;
  createdAt: Date | null;
  likesCount: number | null;
  commentsCount: number | null;
  repostsCount: number | null;
  isUnavailable: boolean;
  author: {
    id: number;
    name: string;
    username: string;
    privacySetting: UserPrivacySetting;
    accountState: AccountState;
  } | null;
  mediaAttachments?: SafePostMediaAttachmentDTO[];
};

/** Defines the internal embedded source-post record before availability and media projection. */
export type SafePostEmbedRecord = Omit<
  SafePostEmbedDTO,
  "isUnavailable" | "mediaAttachments"
> & {
  id: number;
  title: string | null;
  content: string;
  kind: PostKind;
  createdAt: Date;
  likesCount: number;
  commentsCount: number;
  repostsCount: number;
  removedAt: Date | null;
  author: {
    id: number;
    name: string;
    username: string;
    privacySetting: UserPrivacySetting;
    accountState: AccountState;
  };
  mediaAttachments?: import("@/posts/dto/safe-post-detail.dto").SafePostMediaAttachmentRecord[];
};

/** Defines the Prisma select that matches the embedded source-post record shape. */
export const SafePostEmbedSelect = {
  id: true,
  title: true,
  content: true,
  kind: true,
  createdAt: true,
  likesCount: true,
  commentsCount: true,
  repostsCount: true,
  removedAt: true,
  author: {
    select: {
      id: true,
      name: true,
      username: true,
      privacySetting: true,
      accountState: true,
    },
  },
  mediaAttachments: {
    orderBy: {
      sortOrder: "asc",
    },
    select: {
      id: true,
      sortOrder: true,
      createdAt: true,
      media: {
        select: {
          id: true,
          kind: true,
          type: true,
          status: true,
          objectKey: true,
          mimeType: true,
          bytes: true,
          width: true,
          height: true,
          durationMs: true,
          createdAt: true,
          updatedAt: true,
          attachedAt: true,
        },
      },
    },
  },
} as const satisfies Prisma.PostSelect;
