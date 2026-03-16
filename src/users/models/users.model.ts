import {
  Field,
  GraphQLISODateTime,
  HideField,
  ID,
  ObjectType,
} from "@nestjs/graphql";

import { Follow } from "@/follows/models/follows.model";
import { Like } from "@/likes/models/likes.model";
import { Post } from "@/posts/models/posts.model";

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

  @Field(() => GraphQLISODateTime)
  updatedAt: Date;

  @Field(() => [Post], { nullable: true })
  posts?: Post[];

  @Field(() => [Like], { nullable: true })
  likes?: Like[];

  @Field(() => [Follow], { nullable: true })
  followers?: Follow[];

  @Field(() => [Follow], { nullable: true })
  following?: Follow[];
}
