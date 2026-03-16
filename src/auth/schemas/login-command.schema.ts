import { z } from "zod";

/**
 * Zod schema for login commands
 *
 * Validates and normalizes login data for the auth service
 */

export const loginCommandSchema = z.object({
  username: z.string().trim().toLowerCase().min(1, "Username is required"),
  password: z.string().trim().min(1, "Password is required"),
});

export type LoginCommand = z.infer<typeof loginCommandSchema>;
