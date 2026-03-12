import { ArgsType, Field } from "@nestjs/graphql";

import { ValidateNested } from "class-validator";
import { Type } from "class-transformer";

import { CreateCommentInput } from "@/comments/dto/create-comment.input";

@ArgsType()
export class CreateCommentArgs {
  /** Payload used to create a new comment. */
  @Field(() => CreateCommentInput)
  @ValidateNested()
  @Type(() => CreateCommentInput)
  input!: CreateCommentInput;
}
