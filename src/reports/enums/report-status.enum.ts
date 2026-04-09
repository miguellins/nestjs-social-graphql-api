import { registerEnumType } from "@nestjs/graphql";

/** Represents the current moderation review state of a content report. */
export enum ReportStatus {
  OPEN = "OPEN",
  DISMISSED = "DISMISSED",
  ACTIONED = "ACTIONED",
}

registerEnumType(ReportStatus, {
  name: "ReportStatus",
  description:
    "Represents the current moderation review state of a content report",
});
