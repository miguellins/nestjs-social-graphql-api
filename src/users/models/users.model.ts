import {
  Field,
  GraphQLISODateTime,
  HideField,
  ID,
  ObjectType,
} from "@nestjs/graphql";

import { FormattedDateTimeField } from "@/graphql/fields/formatted-date-time-field.decorator";

import { Follow } from "@/follows/models/follows.model";
import { Like } from "@/likes/models/likes.model";
import { Post } from "@/posts/models/posts.model";

/**
 * GraphQL model for users
 *
 * Defines the full user shape available in the schema
 */

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

  @FormattedDateTimeField("createdAt", {
    description:
      "Presentation-friendly UTC timestamp for when the user account was created.",
  })
  createdAtFormatted?: string;

  @Field(() => GraphQLISODateTime)
  updatedAt: Date;

  @FormattedDateTimeField("updatedAt", {
    description:
      "Presentation-friendly UTC timestamp for when the user account was last updated.",
  })
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
