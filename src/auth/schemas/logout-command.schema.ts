import { z } from "zod";

/** Zod schema for validating logout input. */
export const logoutCommandSchema = z.object({
  refreshToken: z.string().trim().min(1, "refreshToken is required").max(512),
});

export type LogoutCommand = z.infer<typeof logoutCommandSchema>;
