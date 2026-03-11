import { Field, ID, ObjectType } from "@nestjs/graphql";

/**
 * Small public-safe user shape for nested objects
 *
 * What it does:
 * - exposes only the minimal user fields needed in lists and nested relations
 * - avoids overfetching data in nested GraphQL objects
 * - prevents schema mismatch when only a subset of user fields is selected
 */

@ObjectType({
  description: "Minimal public-safe representation of a User for nested fields",
})
export class SafeUserPreview {
  @Field(() => ID, {
    description: "Unique identifier of the user",
  })
  id: number;

  /** Public display name. */
  name: string;

  /** Unique username used for identification. */
  username: string;
}
