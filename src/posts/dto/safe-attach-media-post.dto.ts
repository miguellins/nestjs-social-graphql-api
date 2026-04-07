import {
  type SafePostListDTO,
  SafePostListSelect,
} from "@/posts/dto/safe-post-list.dto";
import type {
  SafePostMediaAttachmentDTO,
  SafePostMediaAttachmentRecord,
} from "@/posts/dto/safe-post-detail.dto";

import type { Prisma } from "@prisma/client";

/** Defines the safe post shape returned after attaching media to a post. */
export type SafeAttachMediaPostDTO = SafePostListDTO & {
  updatedAt: Date;
  editedAt: Date | null;
  viewsCount: number;
  mediaAttachments?: SafePostMediaAttachmentDTO[];
};

/** Defines the internal attach-media post record shape before media URL projection. */
export type SafeAttachMediaPostRecord = Omit<
  SafeAttachMediaPostDTO,
  "mediaAttachments"
> & {
  mediaAttachments?: SafePostMediaAttachmentRecord[];
};

/** Defines the Prisma select shape that matches the safe attach-media post DTO. */
export const SafeAttachMediaPostSelect = {
  ...SafePostListSelect,

  updatedAt: true,
  editedAt: true,
  viewsCount: true,

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
