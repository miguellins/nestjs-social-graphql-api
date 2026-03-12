import { Field, ID, ObjectType, GraphQLISODateTime } from "@nestjs/graphql";

import { normalizeOutputTextMiddleware } from "@/graphql/middleware/normalize-output-text.middleware";
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

/** Public-safe representation of a User. Contains only non-sensitive information. */
@ObjectType()
export class SafeUser {
  /** Unique identifier of the User. Stable across the system and used for referencing relationship. */
  @Field(() => ID)
  id: number;

  /** Public display name. */
  @Field(() => String, {
    middleware: [normalizeOutputTextMiddleware],
  })
  name: string;

  /** Unique username used for identification. */
  username: string;

  /** Timestamp indicating when the user account was originally created. */
  @Field(() => GraphQLISODateTime)
  createdAt: Date;

  /** Timestamp of the most recent profile update or modification. */
  @Field(() => GraphQLISODateTime)
  updatedAt: Date;

  /** Aggregated counts of related entities such as posts, followers, and following. Only included when explicitly requested. */
  @Field(() => UserCounts, {
    nullable: true,
  })
  _count?: UserCounts;
}
