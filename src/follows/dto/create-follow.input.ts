import { IsNotEmpty, IsNumber, IsPositive } from "class-validator";

import { Field, InputType } from "@nestjs/graphql";

@InputType()
export class CreateFollowInput {
  @Field()
  @IsNumber()
  @IsNotEmpty()
  @IsPositive()
  followerId: number;

  @Field()
  @IsNumber()
  @IsNotEmpty()
  @IsPositive()
  followingId: number;
}
