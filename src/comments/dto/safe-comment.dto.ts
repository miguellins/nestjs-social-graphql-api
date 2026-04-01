import type { Prisma } from "@prisma/client";

/** A DTO representing a safe public view of a comment, excluding sensitive fields. */
export type SafeCommentDTO = {
  id: number;
  content: string;
  createdAt: Date;
  updatedAt: Date;
  authorId: number;
  postId: number;
  author: {
    id: number;
    name: string;
    username: string;
  };
};

/** Prisma select shape for retrieving safe comment fields and author info. */
export const SafeCommentSelect = {
  id: true,
  content: true,
  createdAt: true,
  updatedAt: true,
  authorId: true,
  postId: true,
  author: {
    select: {
      id: true,
      name: true,
      username: true,
    },
  },
} as const satisfies Prisma.CommentSelect;
