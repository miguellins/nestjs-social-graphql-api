import { IsNotEmpty, IsString } from "class-validator";

import { Field, InputType } from "@nestjs/graphql";

@InputType()
export class LoginInput {
  @Field()
  @IsString()
  @IsNotEmpty()
  username: string;

  @Field()
  @IsString()
  @IsNotEmpty()
  password: string;
}
