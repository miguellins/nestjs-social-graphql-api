import { z } from "zod";

/** Zod schema for validated moderator/admin post removal input. */
export const removePostByModeratorCommandSchema = z.object({
  postId: z.number().int().positive(),
  reason: z.string().trim().min(1, "Reason cannot be empty").max(500),
  reportId: z.number().int().positive().optional(),
});

export type RemovePostByModeratorCommand = z.infer<
  typeof removePostByModeratorCommandSchema
>;
