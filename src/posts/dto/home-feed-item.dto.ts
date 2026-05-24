import type { Prisma } from "@prisma/client";

import { PostKind } from "@/posts/enums/post-kind.enum";
import {
  SafePostEmbedSelect,
  type SafePostEmbedDTO,
} from "@/posts/dto/safe-post-embed.dto";

import type {
  SafePostMediaAttachmentDTO,
  SafePostMediaAttachmentRecord,
} from "@/posts/dto/safe-post-detail.dto";

/** Defines the safe home-feed item shape returned by feed reads. */
export type HomeFeedItemDTO = {
  id: number;
  title: string | null;
  content: string;
  kind: PostKind;
  sourcePostId: number | null;
  createdAt: Date;
  likesCount: number;
  commentsCount: number;
  repostsCount: number | null;
  viewerHasLiked: boolean;
  viewerHasBookmarked: boolean;
  viewerHasReposted: boolean;
  sourcePost?: SafePostEmbedDTO | null;
  author: {
    id: number;
    name: string;
    username: string;
  };
  mediaAttachments?: SafePostMediaAttachmentDTO[];
};

type HomeFeedRelationMarker = {
  id: number;
};

/** Defines the internal home-feed item record shape before media URL and viewer-state projection. */
export type HomeFeedItemRecord = Omit<
  HomeFeedItemDTO,
  | "mediaAttachments"
  | "viewerHasLiked"
  | "viewerHasBookmarked"
  | "viewerHasReposted"
  | "sourcePost"
> & {
  likes: HomeFeedRelationMarker[];
  bookmarks: HomeFeedRelationMarker[];
  mediaAttachments?: SafePostMediaAttachmentRecord[];
  sourcePost?:
    | import("@/posts/dto/safe-post-embed.dto").SafePostEmbedRecord
    | null;
};

/** Defines the Prisma select shape that matches the safe home-feed item record. */
export const HomeFeedItemSelect = {
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
    },
  },
  likes: {
    take: 1,
    select: {
      id: true,
    },
  },
  bookmarks: {
    take: 1,
    select: {
      id: true,
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
