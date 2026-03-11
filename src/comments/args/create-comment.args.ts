import { ArgsType, Field } from "@nestjs/graphql";

import { ValidateNested } from "class-validator";
import { Type } from "class-transformer";

import { CreateCommentInput } from "@/comments/dto/create-comment.input";

@ArgsType()
export class CreateCommentArgs {
  @Field(() => CreateCommentInput, {
    description: "Payload used to create a new comment.",
  })
  @ValidateNested()
  @Type(() => CreateCommentInput)
  input!: CreateCommentInput;
}
