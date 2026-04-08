import { registerEnumType } from "@nestjs/graphql";

/** Classifies the product-facing reasons a user can report content. */
export enum ReportReason {
  SPAM = "SPAM",
  HARASSMENT = "HARASSMENT",
  HATE = "HATE",
  SEXUAL_CONTENT = "SEXUAL_CONTENT",
  VIOLENCE = "VIOLENCE",
  MISINFORMATION = "MISINFORMATION",
  OTHER = "OTHER",
}

registerEnumType(ReportReason, {
  name: "ReportReason",
  description: "Classifies the reason a user is reporting content",
});
