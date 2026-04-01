import { Field, InputType, Int } from "@nestjs/graphql";

import { IsInt, IsPositive } from "class-validator";

@InputType()
export class CompletePostMediaUploadInput {
  @Field(() => Int)
  @IsInt()
  @IsPositive()
  mediaId: number;
}
