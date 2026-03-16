import { Field, GraphQLISODateTime, ObjectType } from "@nestjs/graphql";

import { PublicUserIdentity } from "@/users/models/public-user-identity.interface";
import { UserCounts } from "@/users/models/user-counts.model";

/**
 * GraphQL model for safe users
 *
 * Exposes the non-sensitive user fields returned by the API
 */

/** Public user representation with non-sensitive fields */
@ObjectType({ implements: () => PublicUserIdentity })
export class SafeUser extends PublicUserIdentity {
  /** When the user account was created */
  @Field(() => GraphQLISODateTime)
  createdAt: Date;

  /** When the user was last updated */
  @Field(() => GraphQLISODateTime)
  updatedAt: Date;

  /** Related entity counts when explicitly requested */
  @Field(() => UserCounts, {
    nullable: true,
  })
  _count?: UserCounts;
}
