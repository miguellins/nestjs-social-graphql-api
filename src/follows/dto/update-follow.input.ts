import { IsNotEmpty, IsNumber, IsPositive } from "class-validator";

import { Field, InputType } from "@nestjs/graphql";

@InputType()
export class UpdateFollowInput {
  @Field()
  @IsNumber()
  @IsNotEmpty()
  @IsPositive()
  followerId?: number;

  @Field()
  @IsNumber()
  @IsNotEmpty()
  @IsPositive()
  followingId?: number;
}
