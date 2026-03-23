import { z } from "zod";

/**
 * Zod schema for comment updates
 *
 * Validates comment update data for the service layer
 */

export const updateCommentCommandSchema = z.object({
  content: z.string().trim().min(1, "Content cannot be empty").min(2).max(1000),
});

export type UpdateCommentCommand = z.infer<typeof updateCommentCommandSchema>;
