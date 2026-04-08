import { z } from "zod";

import { ReportReason } from "@/reports/enums/report-reason.enum";

/** Zod schema for validating the command to report a post. */
export const reportPostCommandSchema = z.object({
  postId: z.number().int().positive(),
  reason: z.nativeEnum(ReportReason),
  details: z.string().trim().max(500).optional(),
});

export type ReportPostCommand = z.infer<typeof reportPostCommandSchema>;
