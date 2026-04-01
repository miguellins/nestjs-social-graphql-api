import { z } from "zod";

/** Zod schema and type for validating and normalizing login command input. */
export const loginCommandSchema = z.object({
  username: z.string().trim().toLowerCase().min(1, "Username is required"),
  password: z.string().trim().min(1, "Password is required"),
});

export type LoginCommand = z.infer<typeof loginCommandSchema>;
