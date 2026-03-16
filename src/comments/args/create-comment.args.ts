import { ArgsType, Field } from "@nestjs/graphql";

import { CreateCommentInput } from "@/comments/dto/create-comment.input";

import { ValidateNested } from "class-validator";
import { Type } from "class-transformer";

@ArgsType()
export class CreateCommentArgs {
  /** Payload used to create a new comment. */
  @Field(() => CreateCommentInput)
  @ValidateNested()
  @Type(() => CreateCommentInput)
  input!: CreateCommentInput;
}
