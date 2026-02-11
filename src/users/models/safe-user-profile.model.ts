import { Field, ID, ObjectType } from "@nestjs/graphql";

import { UserCounts } from "./user-counts.model";

@ObjectType()
export class SafeUserProfile {
  @Field(() => ID)
  id: number;

  @Field()
  name: string;

  @Field()
  username: string;

  @Field()
  createdAt: Date;

  @Field(() => UserCounts)
  _count: UserCounts;
}
