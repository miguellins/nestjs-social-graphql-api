import { Field, ID, ObjectType, GraphQLISODateTime } from "@nestjs/graphql";

import { UserCounts } from "@/users/models/user-counts.model";

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

@ObjectType({
  description:
    "Public-safe representation of a User. Contains only non-sensitive information",
})
export class SafeUser {
  @Field(() => ID, {
    description:
      "Unique identifier of the User. Stable across the system and used for referencing relationship",
  })
  id: number;

  @Field({ description: "Public display name" })
  name: string;

  @Field({ description: "Unique username used for identification" })
  username: string;

  @Field(() => GraphQLISODateTime, {
    description:
      "Timestamp indicating when the user account was originally created",
  })
  createdAt: Date;

  @Field(() => GraphQLISODateTime, {
    description: "Timestamp of the most recent profile update or modification",
  })
  updatedAt: Date;

  @Field(() => UserCounts, {
    nullable: true,
    description:
      "Aggregated counts of related entities such as posts, followers, and following. Only included when explicitly requested",
  })
  _count?: UserCounts;
}
