import { Field, InputType, Int } from "@nestjs/graphql";

import { IsInt, IsPositive } from "class-validator";

@InputType()
export class CompleteProfileAvatarUploadInput {
  @Field(() => Int)
  @IsInt()
  @IsPositive()
  mediaId: number;
}
