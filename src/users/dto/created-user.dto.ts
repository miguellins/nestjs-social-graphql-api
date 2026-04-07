import type { Prisma } from "@prisma/client";

/** Defines the safe user shape returned immediately after account creation. */
export type CreatedUserDTO = {
  id: number;
  name: string;
  username: string;
  createdAt: Date;
  updatedAt: Date;
};

/** Defines the Prisma select shape that keeps create-user reads aligned with the created user DTO. */
export const CreatedUserSelect = {
  id: true,
  name: true,
  username: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.UserSelect;
