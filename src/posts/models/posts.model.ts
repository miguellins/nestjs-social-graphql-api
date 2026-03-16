import { Field, GraphQLISODateTime, ID, ObjectType } from "@nestjs/graphql";

import { SafeUserPreview } from "@/users/models/safe-user-preview.model";
import { PostCounts } from "@/posts/models/post-counts.model";

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
  title: string;

  /** Main textual content of the post. */
  content: string;

  /** Timestamp indicating when the post was originally created. */
  @Field(() => GraphQLISODateTime)
  createdAt: Date;

  /** Public safe preview of the user who authored the post. */
  @Field(() => SafeUserPreview)
  author: SafeUserPreview;

  /** Aggregated metadata related to the post. */
  @Field(() => PostCounts)
  _count: PostCounts;
}
