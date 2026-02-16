import { Prisma } from "@prisma/client";

/**
 * Safe representation of a User returned by the service
 *
 * What it does:
 * - Exposes only non-sensitive user data
 * - Ensures passwords and private fields never leave the backend
 * - Provides a predictable shape for API response
 * - Supports lightweight relationship metadata via '_count'
 *
 * Why it exists:
 * - Prevents accidental data leaks (password, email, tokens)
 * - Creates a clear contract between the database and the API layer
 * - Improves long-term maintainability by centralizing the "safe user" shape
 *
 * Important:
 * This type should ALWAYS be used when returning user data externally
 * Never return the raw Prisma user model
 */

export type SafeUserDTO = {
  id: number;
  name: string;
  username: string;
  createdAt: Date;
  updatedAt: Date;

  _count?: {
    likes: number;
    posts: number;
    followers: number;
    following: number;
  };
};

/**
 * Prisma select shape that matches SafeUserDTO exactly
 *
 * Why:
 * - Guarantees the DB result matches the DTO
 * - Prevents accidental field leakage (email, password)
 * - Gives full type-safety via satisfies
 */

export const SafeUserSelect = {
  id: true,
  name: true,
  username: true,
  createdAt: true,
  updatedAt: true,

  _count: {
    select: {
      likes: true,
      posts: true,
      followers: true,
      following: true,
    },
  },
} satisfies Prisma.UserSelect;
