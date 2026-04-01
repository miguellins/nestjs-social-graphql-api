import { InputType, PartialType } from "@nestjs/graphql";

import { CreatePostInput } from "@/posts/dto/create-post.input";

/** Input type for updating an existing post; all fields are optional and match CreatePostInput. */
@InputType()
export class UpdatePostInput extends PartialType(CreatePostInput) {}
