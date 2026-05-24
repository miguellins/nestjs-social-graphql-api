import { Field, InputType, Int } from "@nestjs/graphql";
import {
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  MinLength,
} from "class-validator";

import { Trim } from "@/common/transformer/trim.transformer";

/** Input used to create a quote post with commentary around a visible source post. */
@InputType()
export class QuotePostInput {
  /** Source post id to quote; repost and quote wrappers resolve to their root original. */
  @Field(() => Int)
  @IsInt()
  @Min(1)
  sourcePostId: number;

  /** Optional quote title using the same bounds as normal post creation. */
  @Field({ nullable: true })
  @IsOptional()
  @IsString()
  @Trim()
  @MinLength(3)
  @MaxLength(50)
  title?: string | null;

  /** Quote commentary using the same bounds as normal post creation. */
  @Field()
  @IsString()
  @Trim()
  @MinLength(3)
  @MaxLength(2000)
  content: string;
}
