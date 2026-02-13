import { Field, InputType, Int } from "@nestjs/graphql";

import { IsNotEmpty, IsString, MaxLength, MinLength } from "class-validator";

import { Transform } from "class-transformer";

/**
 * GraphQL Input Type used when creating a new Post
 *
 * What it does:
 * - Validates incoming data before it reaches the service layer
 * - Prevents empty or malformed posts from being stored
 * - Enforces consistent formatting
 * - Protects the database from low-quality data
 *
 * Why this matters:
 * - Posts are user-generated content - one of the highest-risk entry points
 *
 * Strong validation helps prevent:
 * - Spam content
 * - Accidental empty posts
 * - Extremely large payloads
 * - Formatting inconsistencies
 *
 * Security layer:
 * - This acts as the first boundary of trust
 * - Never rely only on frontend validation
 */

@InputType()
export class CreatePostInput {
  @Field()
  @Transform(({ value }) => (typeof value === "string" ? value.trim() : value))
  @IsString()
  @IsNotEmpty()
  @MinLength(3)
  @MaxLength(50)
  title: string;

  @Field()
  @Transform(({ value }) => (typeof value === "string" ? value.trim() : value))
  @IsString()
  @IsNotEmpty()
  @MinLength(3)
  @MaxLength(200)
  content: string;
}
