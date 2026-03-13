import { Field, ID, InterfaceType } from "@nestjs/graphql";

import { normalizeOutputTextMiddleware } from "@/graphql/middleware/normalize-output-text.middleware";

/**
 * Shared GraphQL interface for public-safe user identity fields
 *
 * Implemented by object types that expose the minimal user information
 * needed for public profiles, previews, and nested actor/author references
 */

@InterfaceType()
export abstract class PublicUserIdentity {
  /** Unique identifier of the user. */
  @Field(() => ID)
  id: number;

  /** Public display name. */
  @Field(() => String, {
    middleware: [normalizeOutputTextMiddleware],
  })
  name: string;

  /** Unique username used for identification. */
  @Field()
  username: string;
}
