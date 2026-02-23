import { Field, ID, ObjectType, GraphQLISODateTime } from "@nestjs/graphql";

import { SafeUserPreview } from "@/posts/models/safe-user-preview.model";
import { PostListItem } from "@/posts/models/post-list-item.model";

/**
 * GraphQL ObjectType representing a lightweight Like response
 *
 * What it does:
 * - Exposes only the necessary fields for list queries
 * - Prevents deep relational nesting
 * - Keeps payload small and predictable
 * - Improves performance for high-volume endpoints
 *
 * Security layer:
 * - Uses SafeUserPreview instead of full User
 * - Uses PostListItem instead of PostDetail
 * - Ensures no sensitive user data is exposed
 *
 * Design philosophy:
 * List endpoints should always return the smallest useful shape
 * Heavy objects belong to single-record detail queries
 *
 * Lightweight DTOs protect both:
 * - Database performance
 * - API stability
 */

@ObjectType({
  description:
    "Lightweight representation of a Like entity optimized for list views",
})
export class LikeListItem {
  @Field(() => ID, {
    description:
      "Unique identifier of the like record. Used for referencing and pagination",
  })
  id: number;

  @Field(() => GraphQLISODateTime, {
    description: "Timestamp indicating when the like was created",
  })
  createdAt: Date;

  @Field(() => SafeUserPreview, {
    description: "Public-safe preview of the user who performed the like",
  })
  user: SafeUserPreview;

  @Field(() => PostListItem, {
    description: "Lightweight representation of the post that was liked",
  })
  post: PostListItem;
}
