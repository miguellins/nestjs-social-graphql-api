import { z } from "zod";

/** Zod schema for validating moderation actions targeting a single report id. */
export const reviewReportActionCommandSchema = z.object({
  reportId: z.number().int().positive(),
});

export type ReviewReportActionCommand = z.infer<
  typeof reviewReportActionCommandSchema
>;
