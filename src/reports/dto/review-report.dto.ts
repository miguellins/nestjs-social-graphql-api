import type { Prisma } from "@prisma/client";

import { ReportTargetType } from "@/reports/enums/report-target-type.enum";
import { ReportReason } from "@/reports/enums/report-reason.enum";
import { ReportStatus } from "@/reports/enums/report-status.enum";

/** Defines the safe moderation review shape returned by report review queries. */
export type ReviewReportDTO = {
  id: number;
  targetType: ReportTargetType;
  targetId: number;
  reason: ReportReason;
  details: string | null;
  status: ReportStatus;
  createdAt: Date;
  reporter: {
    id: number;
    name: string;
    username: string;
  };
};

/** Defines the Prisma select shape used to fetch the raw report data needed to build the safe moderation review DTO. */
export const ReviewReportSelect = {
  id: true,
  postId: true,
  commentId: true,
  reason: true,
  details: true,
  status: true,
  createdAt: true,
  reporter: {
    select: {
      id: true,
      name: true,
      username: true,
    },
  },
} satisfies Prisma.ContentReportSelect;

/** Defines the selected Prisma row shape used to map moderation review reads into the safe review DTO. */
export type ReviewReportRow = Prisma.ContentReportGetPayload<{
  select: typeof ReviewReportSelect;
}>;
