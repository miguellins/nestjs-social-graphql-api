import { Field, Int, ObjectType } from "@nestjs/graphql";

/** Public GraphQL view of one active authenticated session. */
@ObjectType()
export class SessionInfo {
  /** Stable session identifier. */
  @Field(() => Int)
  id: number;

  /** Timestamp when the session was first created. */
  @Field()
  createdAt: Date;

  /** Timestamp when the session last refreshed successfully. */
  @Field()
  lastUsedAt: Date;

  /** Timestamp when the refresh session expires. */
  @Field()
  expiresAt: Date;

  /** Raw user-agent captured for the session when available. */
  @Field({ nullable: true })
  userAgent?: string | null;

  /** Whether this entry matches the authenticated request session. */
  @Field()
  isCurrent: boolean;
}
