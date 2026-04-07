import type { Prisma } from "@prisma/client";

/** Service-level DTO representing a like with nested user and post details. */
export type LikeDetailDTO = {
  id: number;
  createdAt: Date;

  user: {
    id: number;
    name: string;
    username: string;
  };

  post: {
    id: number;
    title: string | null;
    content: string;
    createdAt: Date;
    likesCount: number;

    author: {
      id: number;
      name: string;
      username: string;
    };
  };
};

/** Prisma select shape for LikeDetailDTO exposing safe fields and nested relations. */
export const LikeDetailSelect = {
  id: true,
  createdAt: true,

  user: {
    select: {
      id: true,
      name: true,
      username: true,
    },
  },

  post: {
    select: {
      id: true,
      title: true,
      content: true,
      createdAt: true,
      likesCount: true,

      author: {
        select: {
          id: true,
          name: true,
          username: true,
        },
      },
    },
  },
} satisfies Prisma.LikeSelect;
