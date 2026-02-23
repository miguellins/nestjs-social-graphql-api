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

@ObjectType({
  description: "Core representation of a Follow relationship between two users",
})
export class Follow {
  @Field(() => ID, {
    description: "Unique identifier of the follow relationship record",
  })
  id: number;

  @Field(() => GraphQLISODateTime, {
    description:
      "Timestamp indicating when the follow relationship was created",
  })
  createdAt: Date;

  @Field(() => Int, {
    description:
      "Identifier of the user who initiated the follow action (the follower)",
  })
  followerId: number;

  @Field(() => Int, {
    description: "Identifier of the user being followed (the following)",
  })
  followingId: number;

  @Field(() => SafeUserPreview, {
    nullable: true,
    description: "Optional lightweight preview of the follower user",
  })
  follower?: SafeUserPreview;

  @Field(() => SafeUserPreview, {
    nullable: true,
    description: "Optional lightweight preview of the follower user",
  })
  following?: SafeUserPreview;
}
