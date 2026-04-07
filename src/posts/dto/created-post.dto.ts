import type { Prisma } from "@prisma/client";

/** Defines the safe post shape returned immediately after post creation. */
export type CreatedPostDTO = {
  id: number;
  title: string | null;
  content: string;
  createdAt: Date;
  author: {
    id: number;
    name: string;
    username: string;
  };
};

/** Defines the Prisma select that keeps create-post reads aligned with the created post DTO shape. */
export const CreatedPostSelect = {
  id: true,
  title: true,
  content: true,
  createdAt: true,
  author: {
    select: {
      id: true,
      name: true,
      username: true,
    },
  },
} satisfies Prisma.PostSelect;
