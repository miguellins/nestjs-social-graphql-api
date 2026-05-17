import { Field, InputType } from "@nestjs/graphql";

import { IsNotEmpty, IsOptional, IsString, MaxLength } from "class-validator";

import { Trim } from "@/common/transformer/trim.transformer";

@InputType()
export class RequestProfileAvatarUploadInput {
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
