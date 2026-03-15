import { z } from "zod";

/**
 * Defines the runtime user write payloads used by UsersService
 */

const usernameRegex = /^[a-zA-Z0-9_]+$/;

export const createUserCommandSchema = z.object({
  name: z.string().trim().min(1, "name is required").min(3).max(20),
  email: z
    .string()
    .trim()
    .toLowerCase()
    .min(1, "email is required")
    .email()
    .min(3)
    .max(100),
  username: z
    .string()
    .trim()
    .toLowerCase()
    .min(1, "username is required")
    .min(3)
    .max(15)
    .regex(usernameRegex, {
      message: "username can only contain letters, numbers and underscore",
    }),
  password: z.string().trim().min(1, "password is required").min(8).max(72),
});

export const updateUserCommandSchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(1, "Name cannot be empty")
      .min(3)
      .max(20)
      .optional(),
    email: z
      .string()
      .trim()
      .toLowerCase()
      .min(1, "Email cannot be empty")
      .email()
      .min(3)
      .max(100)
      .optional(),
    username: z
      .string()
      .trim()
      .toLowerCase()
      .min(1, "Username cannot be empty")
      .min(3)
      .max(15)
      .regex(usernameRegex, {
        message: "username can only contain letters, numbers and underscore",
      })
      .optional(),
    password: z
      .string()
      .trim()
      .min(1, "Password cannot be empty")
      .min(8)
      .max(72)
      .optional(),
  })
  .refine(
    (value) => Object.values(value).some((field) => field !== undefined),
    {
      message: "No fields provided to update",
    },
  );

export type CreateUserCommand = z.infer<typeof createUserCommandSchema>;
export type UpdateUserCommand = z.infer<typeof updateUserCommandSchema>;
