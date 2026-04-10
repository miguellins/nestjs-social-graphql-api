import { z } from "zod";

/** Zod schema for validated moderator/admin comment removal input. */
export const removeCommentByModeratorCommandSchema = z.object({
  commentId: z.number().int().positive(),
  reason: z.string().trim().min(1, "Reason cannot be empty").max(500),
  reportId: z.number().int().positive().optional(),
});

export type RemoveCommentByModeratorCommand = z.infer<
  typeof removeCommentByModeratorCommandSchema
>;
