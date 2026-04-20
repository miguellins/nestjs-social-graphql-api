import type { Prisma } from "@prisma/client";

import type {
  SafePostMediaAttachmentDTO,
  SafePostMediaAttachmentRecord,
} from "@/posts/dto/safe-post-detail.dto";

/** Defines the safe home-feed item shape returned by feed reads. */
export type HomeFeedItemDTO = {
  id: number;
  title: string | null;
  content: string;
  createdAt: Date;
  likesCount: number;
  commentsCount: number;
  viewerHasLiked: boolean;
  viewerHasBookmarked: boolean;
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
  "mediaAttachments" | "viewerHasLiked" | "viewerHasBookmarked"
> & {
  likes: HomeFeedRelationMarker[];
  bookmarks: HomeFeedRelationMarker[];
  mediaAttachments?: SafePostMediaAttachmentRecord[];
};

/** Defines the Prisma select shape that matches the safe home-feed item record. */
export const HomeFeedItemSelect = {
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
