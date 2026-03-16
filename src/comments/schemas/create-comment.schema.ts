import { z } from "zod";

/**
 * Zod schema for comment creation
 *
 * Validates comment data for the service layer
 */

export const createCommentCommandSchema = z.object({
  content: z.string().trim().min(1, "Content cannot be empty").min(2).max(1000),
  postId: z.number().int().positive(),
});

export type CreateCommentCommand = z.infer<typeof createCommentCommandSchema>;
