import { InputType, PartialType } from "@nestjs/graphql";

import { CreatePostInput } from "@/posts/dto/create-post.input";

/**
 * GraphQL Input Type used when updating an existing post
 *
 * What it does:
 * - Validates incoming data before it reaches the service layer
 * - Allows partial updates (PATCH-style behavior)
 * - Normalizes string input to maintain database consistency
 * - Prevents empty or malformed values from being stored
 *
 * Security role:
 * - Second defensive layer after authentication
 * - Ensures only properly formatted data is processed
 */

@InputType()
export class UpdatePostInput extends PartialType(CreatePostInput) {}
