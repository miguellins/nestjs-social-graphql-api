import { z } from "zod";

/**
 * Zod schemas for post writes
 *
 * Validates create and update data for the post service
 */

export const createPostCommandSchema = z.object({
  title: z.string().trim().min(1, "Title cannot be empty").min(3).max(50),
  content: z.string().trim().min(1, "Content cannot be empty").min(3).max(2000),
});

export const updatePostCommandSchema = z
  .object({
    title: z
      .string()
      .trim()
      .min(1, "Title cannot be empty")
      .min(3)
      .max(50)
      .optional(),
    content: z
      .string()
      .trim()
      .min(1, "Content cannot be empty")
      .min(3)
      .max(2000)
      .optional(),
  })
  .refine(
    (value) => Object.values(value).some((field) => field !== undefined),
    {
      message: "No fields provided to update",
    },
  );

export type CreatePostCommand = z.infer<typeof createPostCommandSchema>;
export type UpdatePostCommand = z.infer<typeof updatePostCommandSchema>;
