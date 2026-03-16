import { Field, ID, InterfaceType } from "@nestjs/graphql";

import { normalizeOutputTextMiddleware } from "@/graphql/middleware/normalize-output-text.middleware";

/**
 * GraphQL interface for public user identity
 *
 * Defines the shared fields exposed by user models
 */

@InterfaceType()
export abstract class PublicUserIdentity {
  /** Unique identifier of the user */
  @Field(() => ID)
  id: number;

  /** Public display name */
  @Field(() => String, {
    middleware: [normalizeOutputTextMiddleware],
  })
  name: string;

  /** Unique username used for identification */
  @Field()
  username: string;
}
