import { Field, ID, ObjectType, GraphQLISODateTime } from "@nestjs/graphql";

import { SafeUserPreview } from "src/posts/models/safe-user-preview.model";
import { PostListItem } from "src/posts/models/post-list-item.model";

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

@ObjectType()
export class LikeListItem {
  @Field(() => ID)
  id: number;

  @Field(() => GraphQLISODateTime)
  createdAt: Date;

  @Field(() => SafeUserPreview)
  user: SafeUserPreview;

  @Field(() => PostListItem)
  post: PostListItem;
}
