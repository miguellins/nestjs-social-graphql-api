import type { Prisma } from "@prisma/client";

/** Shared safe author shape exposed inside comment payloads. */
export type SafeCommentAuthorDTO = {
  id: number;
  name: string;
  username: string;
};

/** Flat safe comment record loaded directly from Prisma before thread assembly. */
export type SafeCommentRecord = {
  id: number;
  content: string;
  createdAt: Date;
  updatedAt: Date;
  authorId: number;
  postId: number;
  parentCommentId: number | null;
  author: SafeCommentAuthorDTO;
};

/** Safe direct-reply shape exposed under one top-level comment in the v1 thread contract. */
export type SafeCommentReplyDTO = SafeCommentRecord;

/** Safe threaded comment shape exposed by comment reads and mutations. */
export type SafeCommentDTO = SafeCommentRecord & {
  repliesCount: number;
  replies: SafeCommentReplyDTO[];
};

/** Prisma select shape for retrieving the flat safe comment record and author info. */
export const SafeCommentSelect = {
  id: true,
  content: true,
  createdAt: true,
  updatedAt: true,
  authorId: true,
  postId: true,
  parentCommentId: true,
  author: {
    select: {
      id: true,
      name: true,
      username: true,
    },
  },
} as const satisfies Prisma.CommentSelect;
