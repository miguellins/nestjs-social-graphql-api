import {
  Field,
  GraphQLISODateTime,
  ID,
  Int,
  ObjectType,
} from "@nestjs/graphql";

import { SafeUserPreview } from "@/users/models/safe-user-preview.model";
import { SafeCommentDTO } from "@/comments/models/safe-comment.model";
import { LikePreview } from "@/posts/models/like-preview.model";
import { PostCounts } from "@/posts/models/post-counts.model";

/**
 * GraphQL model for post details
 *
 * Exposes the detailed post view returned by the API
 */

/** Comprehensive representation of a Post entity intended for detailed views. */
@ObjectType()
export class PostDetail {
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

  /** Timestamp indicating the last time the post was updated. */
  @Field(() => GraphQLISODateTime)
  updatedAt: Date;

  /** Total number of times the post detail view has been accessed successfully. */
  @Field(() => Int)
  viewsCount: number;

  /** Public safe preview of the user who authored the post. */
  @Field(() => SafeUserPreview)
  author: SafeUserPreview;

  /** Aggregated metadata related to the post. */
  @Field(() => PostCounts)
  _count: PostCounts;

  /** Optional lightweight list of likes associated with the post. */
  @Field(() => [LikePreview], {
    nullable: true,
  })
  likes?: LikePreview[];

  /** Optional lightweight list of comments associated with the post. */
  @Field(() => [SafeCommentDTO], {
    nullable: true,
  })
  comments?: SafeCommentDTO[];
}
