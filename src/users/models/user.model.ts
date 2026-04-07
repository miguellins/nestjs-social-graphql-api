import {
  Field,
  GraphQLISODateTime,
  HideField,
  ID,
  ObjectType,
} from "@nestjs/graphql";

import { FormattedDateTimeField } from "@/graphql/fields/formatted-date-time-field.decorator";

import { Follow } from "@/follows/models/follow.model";
import { Like } from "@/likes/models/like.model";
import { Post } from "@/posts/models/post.model";

/** Full user object model used for internal GraphQL relations where broader user fields are needed. */
@ObjectType()
export class User {
  /** Unique identifier of the user account. */
  @Field(() => ID)
  id: number;

  /** Public display name. */
  name: string;

  /** Email address associated with the user account. */
  email: string;

  /** Unique username used for identification. */
  username: string;

  @HideField()
  password: string;

  /** Timestamp indicating when the user account was created. */
  @Field(() => GraphQLISODateTime)
  createdAt: Date;

  /** Presentation-friendly UTC timestamp for when the user account was created. */
  @FormattedDateTimeField("createdAt")
  createdAtFormatted?: string;

  /** Timestamp indicating when the user account was last updated. */
  @Field(() => GraphQLISODateTime)
  updatedAt: Date;

  /** Presentation-friendly UTC timestamp for when the user account was last updated. */
  @FormattedDateTimeField("updatedAt")
  updatedAtFormatted?: string;

  /** Optional list of posts created by the user. */
  @Field(() => [Post], { nullable: true })
  posts?: Post[];

  /** Optional list of likes created by the user. */
  @Field(() => [Like], { nullable: true })
  likes?: Like[];

  /** Optional list of users following this user. */
  @Field(() => [Follow], { nullable: true })
  followers?: Follow[];

  /** Optional list of users this account follows. */
  @Field(() => [Follow], { nullable: true })
  following?: Follow[];
}
