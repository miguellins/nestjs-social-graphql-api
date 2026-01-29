import { Field, InputType } from "@nestjs/graphql";
import { IsEmail, IsNotEmpty, IsString, MinLength } from "class-validator";

@InputType()
export class CreateUserInput {
  @Field()
  @IsString()
  @IsNotEmpty()
  @MinLength(3)
  name: string;

  @Field()
  @IsEmail()
  @IsNotEmpty()
  @MinLength(3)
  email: string;

  @Field()
  @IsString()
  @IsNotEmpty()
  @MinLength(3)
  username: string;

  // accepted as input, but never returned
  @Field()
  @IsString()
  @IsNotEmpty()
  @MinLength(3)
  password: string;
}
