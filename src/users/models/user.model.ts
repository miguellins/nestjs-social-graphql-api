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

@ObjectType()
export class User {
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

  @Field(() => GraphQLISODateTime)
  createdAt: Date;

  /** Presentation-friendly UTC timestamp for when the user account was created. */
  @FormattedDateTimeField("createdAt")
  createdAtFormatted?: string;

  @Field(() => GraphQLISODateTime)
  updatedAt: Date;

  /** Presentation-friendly UTC timestamp for when the user account was last updated. */
  @FormattedDateTimeField("updatedAt")
  updatedAtFormatted?: string;

  @Field(() => [Post], { nullable: true })
  posts?: Post[];

  @Field(() => [Like], { nullable: true })
  likes?: Like[];

  @Field(() => [Follow], { nullable: true })
  followers?: Follow[];

  @Field(() => [Follow], { nullable: true })
  following?: Follow[];
}
