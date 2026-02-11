import { Field, ID, ObjectType, GraphQLISODateTime } from "@nestjs/graphql";

@ObjectType()
export class SafeUser {
  @Field(() => ID)
  id: number;

  @Field()
  name: string;

  @Field()
  username: string;

  @Field(() => GraphQLISODateTime)
  createdAt: Date;

  @Field(() => GraphQLISODateTime)
  updatedAt: Date;
}
