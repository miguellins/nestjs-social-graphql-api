import { z } from "zod";

import {
  USERNAME_REGEX,
  USERNAME_REGEX_MESSAGE,
} from "@/users/constants/username.constants";

/**
 * Zod schemas for user read identifiers
 *
 * Validates and normalizes public lookup inputs for the user service
 */

export const getUserByUsernameCommandSchema = z.object({
  username: z
    .string()
    .trim()
    .toLowerCase()
    .min(1, "username is required")
    .min(3)
    .max(15)
    .regex(USERNAME_REGEX, {
      message: USERNAME_REGEX_MESSAGE,
    }),
});

export type GetUserByUsernameCommand = z.infer<
  typeof getUserByUsernameCommandSchema
>;
