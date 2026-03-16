import { InputType, PartialType } from "@nestjs/graphql";

import { CreatePostInput } from "@/posts/dto/create-post.input";

/**
 * GraphQL input for post updates
 *
 * Validates partial post data before it reaches the service layer
 */

@InputType()
export class UpdatePostInput extends PartialType(CreatePostInput) {}
