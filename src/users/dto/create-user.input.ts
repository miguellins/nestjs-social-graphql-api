// src/users/dto/create-user.input.ts
import { Field, InputType } from "@nestjs/graphql";

@InputType()
export class CreateUserInput {
  @Field()
  name: string;

  @Field()
  email: string;

  @Field()
  username: string;

  // accepted as input, but never returned
  @Field()
  password: string;
}
