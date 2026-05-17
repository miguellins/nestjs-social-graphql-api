import { Field, InputType } from "@nestjs/graphql";

import {
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUrl,
  MaxLength,
} from "class-validator";

import { Trim } from "@/common/transformer/trim.transformer";

@InputType()
export class UpdateMyProfileInput {
  /** Updated plain-text biography for the public profile. */
  @Field({
    nullable: true,
  })
  @Trim()
  @IsString()
  @MaxLength(500)
  @IsOptional()
  bio?: string | null;

  /** Updated optional public website URL. */
  @Field({
    nullable: true,
  })
  @Trim()
  @IsUrl({
    protocols: ["http", "https"],
    require_protocol: true,
  })
  @MaxLength(255)
  @IsOptional()
  websiteUrl?: string | null;

  /** Updated optional short profile location. */
  @Field({
    nullable: true,
  })
  @Trim()
  @IsString()
  @IsNotEmpty()
  @MaxLength(80)
  @IsOptional()
  location?: string | null;
}
