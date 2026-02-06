import { IsNotEmpty, IsNumber, IsPositive } from "class-validator";

import { Field, InputType } from "@nestjs/graphql";

@InputType()
export class CreateLikeInput {
  @Field()
  @IsNotEmpty()
  @IsPositive()
  @IsNumber()
  postId: number;
}
