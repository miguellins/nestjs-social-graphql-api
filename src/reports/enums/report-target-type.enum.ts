import { registerEnumType } from "@nestjs/graphql";

/** Classifies whether a moderation report targets a post or a comment. */
export enum ReportTargetType {
  POST = "POST",
  COMMENT = "COMMENT",
}

registerEnumType(ReportTargetType, {
  name: "ReportTargetType",
  description: "Identifies whether a report targets a post or a comment",
});
