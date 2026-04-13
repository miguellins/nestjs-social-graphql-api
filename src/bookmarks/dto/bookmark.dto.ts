import type { Prisma } from "@prisma/client";

import {
  SafePostListSelect,
  type SafePostListDTO,
} from "@/posts/dto/safe-post-list.dto";

/** Safe bookmark shape exposed by bookmark reads and bookmark creation. */
export type BookmarkDTO = {
  id: number;
  createdAt: Date;
  post: SafePostListDTO;
};

/** Prisma select shape for BookmarkDTO. */
export const BookmarkSelect = {
  id: true,
  createdAt: true,
  post: {
    select: SafePostListSelect,
  },
} satisfies Prisma.BookmarkSelect;
