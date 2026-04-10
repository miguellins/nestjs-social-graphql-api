import { Field, InputType, Int } from "@nestjs/graphql";

import {
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from "class-validator";

import { Trim } from "@/common/transformer/trim.transformer";

/** GraphQL input for moderator/admin comment removal with a required reason. */
@InputType()
export class RemoveCommentByModeratorInput {
  /** Unique identifier of the comment being removed from normal reads. */
  @Field(() => Int)
  @IsInt()
  @Min(1)
  commentId: number;

  /** Required moderator/admin justification for the removal action. */
  @Field()
  @Trim()
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  reason: string;

  /** Optional reviewed report linked to the removal action. */
  @Field(() => Int, { nullable: true })
  @IsOptional()
  @IsInt()
  @Min(1)
  reportId?: number;
}
