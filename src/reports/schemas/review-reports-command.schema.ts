import { z } from "zod";

import { ChronologicalOrder } from "@/common/enums/chronological-order.enum";
import { ReportTargetType } from "@/reports/enums/report-target-type.enum";
import { ReportStatus } from "@/reports/enums/report-status.enum";

/** Zod schema for validating report review list queries. */
export const reviewReportsCommandSchema = z.object({
  first: z.number().int().positive().optional(),
  after: z.string().trim().min(1).optional(),
  orderBy: z.nativeEnum(ChronologicalOrder).optional(),
  status: z.nativeEnum(ReportStatus).optional(),
  targetType: z.nativeEnum(ReportTargetType).optional(),
});

export type ReviewReportsCommand = z.infer<typeof reviewReportsCommandSchema>;
