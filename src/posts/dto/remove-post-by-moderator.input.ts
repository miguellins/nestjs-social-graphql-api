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

/** GraphQL input for moderator/admin post removal with a required reason. */
@InputType()
export class RemovePostByModeratorInput {
  /** Unique identifier of the post being removed from normal reads. */
  @Field(() => Int)
  @IsInt()
  @Min(1)
  postId: number;

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
