import { z } from "zod";

import {
  USERNAME_REGEX,
  USERNAME_REGEX_MESSAGE,
} from "@/users/constants/username.constants";

/**
 * Zod schemas for user writes
 *
 * Validates create and update data for the user service
 */

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
    .regex(USERNAME_REGEX, {
      message: USERNAME_REGEX_MESSAGE,
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
      .regex(USERNAME_REGEX, {
        message: USERNAME_REGEX_MESSAGE,
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

const nullableTrimmedOptionalString = (max: number, emptyMessage: string) =>
  z
    .union([
      z
        .string()
        .trim()
        .max(max)
        .transform((value) => value || null),
      z.null(),
    ])
    .optional()
    .refine((value) => value === undefined || value === null || value !== "", {
      message: emptyMessage,
    });

export const updateMyProfileCommandSchema = z
  .object({
    bio: z
      .union([
        z
          .string()
          .trim()
          .max(500)
          .transform((value) => value.replace(/\s+/g, " ") || null),
        z.null(),
      ])
      .optional(),
    websiteUrl: z
      .union([
        z
          .string()
          .trim()
          .max(255)
          .url()
          .refine((value) => /^https?:\/\//i.test(value), {
            message: "Website URL must use http or https",
          }),
        z.null(),
      ])
      .optional(),
    location: nullableTrimmedOptionalString(80, "Location cannot be empty"),
  })
  .refine(
    (value) => Object.values(value).some((field) => field !== undefined),
    {
      message: "No profile fields provided to update",
    },
  );

export type CreateUserCommand = z.infer<typeof createUserCommandSchema>;
export type UpdateUserCommand = z.infer<typeof updateUserCommandSchema>;
export type UpdateMyProfileCommand = z.infer<
  typeof updateMyProfileCommandSchema
>;
