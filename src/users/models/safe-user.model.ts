import { Field, ObjectType, GraphQLISODateTime } from "@nestjs/graphql";

import { PublicUserIdentity } from "@/users/models/public-user-identity.interface";
import { UserCounts } from "@/users/models/user-counts.model";

/**
 * Public GraphQL user model
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
