import { z } from "zod";

/** Zod schema for validating password reset request (initiation) input. */
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

/** Zod schema for validating reset password confirmation input. */
export const resetPasswordCommandSchema = z.object({
  token: z.string().trim().min(1, "token is required").max(512),
  newPassword: z.string().trim().min(1, "password is required").min(8).max(72),
});

export type RequestPasswordResetCommand = z.infer<
  typeof requestPasswordResetCommandSchema
>;

export type ResetPasswordCommand = z.infer<typeof resetPasswordCommandSchema>;
