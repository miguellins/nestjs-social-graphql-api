import { Field, Int, ObjectType } from "@nestjs/graphql";

/**
 * Lightweight public-safe representation of a notification actor
 *
 * What it does:
 * - Exposes only minimal actor data required by notification UIs
 * - Prevents sensitive user fields from being returned in nested objects
 * - Keeps notification payloads small and predictable
 */

/** Minimal safe representation of the actor who triggered a notification. */
@ObjectType()
export class NotificationActorDTO {
  /** Unique identifier of the actor user. */
  @Field(() => Int)
  id: number;

  /** Public username of the actor user. */
  username: string;

  /** Optional public display name of the actor user. */
  name!: string | null;
}
