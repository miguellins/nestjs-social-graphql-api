import { Field, ID, ObjectType, GraphQLISODateTime } from "@nestjs/graphql";

import { UserCounts } from "./user-counts.model";

/**
 * GraphQL Object Type representing a SAFE public view of a user
 *
 * What it does:
 * - Exposes only non-sensitive user data
 * - Prevents accidental leakage of private fields
 * - Creates a clear boundary between public API data and internal DB models
 * - Improves long-term API security
 *
 * Security benefits:
 * - Email is intentionally excluded
 * - Password is NEVER exposed
 * - Reduces attack surface if the API is compromised
 *
 * Architectural benefit:
 * - Treat this as your "public contract"
 * - Even if your database schema changes, clients remain protected
 */

@ObjectType()
export class SafeUser {
  @Field(() => ID)
  id: number;

  @Field()
  name: string;

  @Field()
  username: string;

  @Field(() => GraphQLISODateTime)
  createdAt: Date;

  @Field(() => GraphQLISODateTime)
  updatedAt: Date;

  @Field(() => UserCounts, { nullable: true })
  _count?: UserCounts;
}
