import { Field, InputType, Int } from "@nestjs/graphql";

import {
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsPositive,
  IsString,
  MaxLength,
} from "class-validator";

import { Trim } from "@/common/transformer/trim.transformer";

@InputType()
export class RequestPostMediaUploadInput {
  @Field(() => Int)
  @IsInt()
  @IsPositive()
  postId: number;

  @Field()
  @Trim()
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  mimeType: string;

  @Field({
    nullable: true,
  })
  @Trim()
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  originalFileName?: string;
}
