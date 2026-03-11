import { Field, Int, ObjectType } from "@nestjs/graphql";

/**
 * Lightweight public-safe representation of a notification actor
 *
 * What it does:
 * - Exposes only minimal actor data required by notification UIs
 * - Prevents sensitive user fields from being returned in nested objects
 * - Keeps notification payloads small and predictable
 */

@ObjectType({
  description:
    "Minimal safe representation of the actor who triggered a notification",
})
export class NotificationActorDTO {
  @Field(() => Int, {
    description: "Unique identifier of the actor user",
  })
  id: number;

  /** Public username of the actor user. */
  username: string;

  /** Optional public display name of the actor user. */
  name!: string | null;
}
