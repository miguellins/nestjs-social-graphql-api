import {
  Field,
  GraphQLISODateTime,
  ID,
  Int,
  ObjectType,
} from "@nestjs/graphql";

import { SafeUserPreview } from "src/posts/models/safe-user-preview.model";

/**
 * Follow relationship between two users
 *
 * What it does:
 * - Represents a directional edge: follower - following
 * - Exposes both foreign keys + optional user previews
 *
 * Why SafeUserPreview:
 * - Prevents leaking private user fields
 * - Keeps nested queries lightweight (better performance)
 */

@ObjectType()
export class Follow {
  @Field(() => ID)
  id: number;

  @Field(() => GraphQLISODateTime)
  createdAt: Date;

  @Field(() => Int)
  followerId: number;

  @Field(() => Int)
  followingId: number;

  @Field(() => SafeUserPreview, { nullable: true })
  follower?: SafeUserPreview;

  @Field(() => SafeUserPreview, { nullable: true })
  following?: SafeUserPreview;
}
