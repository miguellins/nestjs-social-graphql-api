import {
  type SafeCommentDTO,
  SafeCommentSelect,
} from "@/comments/dto/safe-comment.dto";

import {
  type SafePostListDTO,
  SafePostListSelect,
} from "@/posts/dto/safe-post-list.dto";

import { MediaKind, MediaStatus, MediaType } from "@/media/models/media.enums";

import type { Prisma } from "@prisma/client";

/** Defines the safe post detail shape used by services. */
export type SafePostDetailDTO = SafePostListDTO & {
  updatedAt: Date;
  editedAt: Date | null;
  viewsCount: number;

  likes?: {
    id: number;
    createdAt: Date;

    user: {
      id: number;
      name: string;
      username: string;
    };
  }[];

  comments?: SafeCommentDTO[];

  mediaAttachments?: SafePostMediaAttachmentDTO[];
};

/** Defines the safe media shape exposed inside post detail responses. */
export type SafePostDetailMediaDTO = {
  id: number;
  kind: MediaKind;
  type: MediaType;
  status: MediaStatus;
  objectKey: string;
  publicUrl: string;
  mimeType: string;
  bytes: number | null;
  width: number | null;
  height: number | null;
  durationMs: number | null;
  createdAt: Date;
  updatedAt: Date;
  attachedAt: Date | null;
};

/** Defines the safe post-media attachment shape exposed in post detail responses. */
export type SafePostMediaAttachmentDTO = {
  id: number;
  sortOrder: number;
  createdAt: Date;
  media: SafePostDetailMediaDTO;
};

/** Defines the internal post-detail media record shape before public URL projection. */
export type SafePostDetailMediaRecord = Omit<
  SafePostDetailMediaDTO,
  "publicUrl"
>;

/** Defines the internal post-media attachment record shape before media URL projection. */
export type SafePostMediaAttachmentRecord = Omit<
  SafePostMediaAttachmentDTO,
  "media"
> & {
  media: SafePostDetailMediaRecord;
};

/** Defines the internal post detail record shape before media URL projection. */
export type SafePostDetailRecord = Omit<
  SafePostDetailDTO,
  "mediaAttachments"
> & {
  mediaAttachments?: SafePostMediaAttachmentRecord[];
};

/** Defines the Prisma select shape that matches the safe post detail DTO. */
export const SafePostDetailSelect = {
  ...SafePostListSelect,

  updatedAt: true,
  editedAt: true,
  viewsCount: true,

  likes: {
    select: {
      id: true,
      createdAt: true,

      user: {
        select: {
          id: true,
          name: true,
          username: true,
        },
      },
    },
  },

  comments: {
    orderBy: {
      createdAt: "desc",
    },

    select: SafeCommentSelect,
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
