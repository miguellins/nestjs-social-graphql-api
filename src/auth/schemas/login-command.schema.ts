import { z } from "zod";

/**
 * Defines the runtime login payload shape used by AuthService
 */

export const loginCommandSchema = z.object({
  username: z.string().trim().toLowerCase().min(1, "Username is required"),
  password: z.string().trim().min(1, "Password is required"),
});

export type LoginCommand = z.infer<typeof loginCommandSchema>;
