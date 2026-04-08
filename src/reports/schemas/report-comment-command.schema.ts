import { z } from "zod";

import { ReportReason } from "@/reports/enums/report-reason.enum";

/** Zod schema for validating the command to report a comment. */
export const reportCommentCommandSchema = z.object({
  commentId: z.number().int().positive(),
  reason: z.nativeEnum(ReportReason),
  details: z.string().trim().max(500).optional(),
});

export type ReportCommentCommand = z.infer<typeof reportCommentCommandSchema>;
