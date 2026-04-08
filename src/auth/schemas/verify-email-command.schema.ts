import { z } from "zod";

/** Zod schema for validating email verification token input. */
export const verifyEmailCommandSchema = z.object({
  token: z.string().trim().min(1, "token is required").max(512),
});

export type VerifyEmailCommand = z.infer<typeof verifyEmailCommandSchema>;
