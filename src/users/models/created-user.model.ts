import { Field, GraphQLISODateTime, ObjectType } from "@nestjs/graphql";

import { FormattedDateTimeField } from "@/graphql/fields/formatted-date-time-field.decorator";

import { PublicUserIdentity } from "@/users/models/public-user-identity.interface";

/** Public user payload returned immediately after successful account creation. */
@ObjectType({ implements: () => PublicUserIdentity })
export class CreatedUser extends PublicUserIdentity {
  /** Timestamp indicating when the user account was created. */
  @Field(() => GraphQLISODateTime)
  createdAt: Date;

  /** Presentation-friendly UTC timestamp for when the user account was created. */
  @FormattedDateTimeField("createdAt")
  createdAtFormatted?: string;

  /** Timestamp indicating when the user account was last updated. */
  @Field(() => GraphQLISODateTime)
  updatedAt: Date;

  /** Presentation-friendly UTC timestamp for when the user account was last updated. */
  @FormattedDateTimeField("updatedAt")
  updatedAtFormatted?: string;
}
