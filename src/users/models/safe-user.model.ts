import { Field, GraphQLISODateTime, ObjectType } from "@nestjs/graphql";

import { FormattedDateTimeField } from "@/graphql/fields/formatted-date-time-field.decorator";

import { PublicUserIdentity } from "@/users/models/public-user-identity.interface";
import { UserCounts } from "@/users/models/user-counts.model";

/** Public user representation with non-sensitive fields */
@ObjectType({ implements: () => PublicUserIdentity })
export class SafeUser extends PublicUserIdentity {
  /** When the user account was created */
  @Field(() => GraphQLISODateTime)
  createdAt: Date;

  /** Presentation-friendly UTC timestamp for UI display. */
  @FormattedDateTimeField("createdAt", {
    description:
      "Presentation-friendly UTC timestamp for when the user account was created.",
  })
  createdAtFormatted?: string;

  /** When the user was last updated */
  @Field(() => GraphQLISODateTime)
  updatedAt: Date;

  /** Presentation-friendly UTC timestamp for UI display. */
  @FormattedDateTimeField("updatedAt", {
    description:
      "Presentation-friendly UTC timestamp for when the user was last updated.",
  })
  updatedAtFormatted?: string;

  /** Related entity counts when explicitly requested */
  @Field(() => UserCounts, {
    nullable: true,
  })
  _count?: UserCounts;
}
