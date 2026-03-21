import { z } from "zod";

/**
 * Zod schemas for password reset workflows
 *
 * Validates and normalizes reset initiation and confirmation inputs
 */

export const requestPasswordResetCommandSchema = z.object({
  email: z
    .string()
    .trim()
    .toLowerCase()
    .min(1, "email is required")
    .email()
    .min(3)
    .max(100),
});

export const resetPasswordCommandSchema = z.object({
  token: z.string().trim().min(1, "token is required").max(512),
  newPassword: z.string().trim().min(1, "password is required").min(8).max(72),
});

export type RequestPasswordResetCommand = z.infer<
  typeof requestPasswordResetCommandSchema
>;
export type ResetPasswordCommand = z.infer<typeof resetPasswordCommandSchema>;
