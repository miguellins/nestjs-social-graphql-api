import {
  Field,
  GraphQLISODateTime,
  ID,
  Int,
  ObjectType,
} from "@nestjs/graphql";

import { SafeUserPreview } from "@/users/models/safe-user-preview.model";

/**
 * GraphQL model for posts
 *
 * Exposes the public post fields returned by the API
 */

/** Core public representation of a Post entity. */
@ObjectType()
export class Post {
  /** Unique identifier of the post. Used for referencing, routing, and relation mapping. */
  @Field(() => ID)
  id: number;

  /** Title of the post. */
  @Field()
  title: string;

  /** Main textual content of the post. */
  @Field()
  content: string;

  /** Timestamp indicating when the post was originally created. */
  @Field(() => GraphQLISODateTime)
  createdAt: Date;

  /** Total number of likes associated with the post. */
  @Field(() => Int)
  likesCount: number;

  /** Total number of comments associated with the post. */
  @Field(() => Int)
  commentsCount: number;

  /** Public safe preview of the user who authored the post. */
  @Field(() => SafeUserPreview)
  author: SafeUserPreview;
}
