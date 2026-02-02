import { IsNotEmpty, IsNumber, IsPositive } from "class-validator";

import { Field, InputType } from "@nestjs/graphql";

@InputType()
export class UpdateLikeInput {
  @Field()
  @IsNotEmpty()
  @IsPositive()
  @IsNumber()
  userId?: number;

  @Field()
  @IsNotEmpty()
  @IsPositive()
  @IsNumber()
  postId?: number;
}
