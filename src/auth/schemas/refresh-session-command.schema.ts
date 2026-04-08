import { z } from "zod";

/** Zod schema for validating refresh-session input. */
export const refreshSessionCommandSchema = z.object({
  refreshToken: z.string().trim().min(1, "refreshToken is required").max(512),
});

export type RefreshSessionCommand = z.infer<typeof refreshSessionCommandSchema>;
