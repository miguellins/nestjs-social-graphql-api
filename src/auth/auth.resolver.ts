import { Args, Mutation, Resolver } from "@nestjs/graphql";

import { Public } from "@/common/decorators/auth.decorator";

import { LoginInput } from "@/auth/dto/login.input";

import { AuthPayload } from "@/auth/auth.payload";
import { AuthService } from "@/auth/auth.service";

@Resolver()
export class AuthResolver {
  constructor(private readonly authService: AuthService) { }

  @Public()
  @Mutation(() => AuthPayload)
  login(@Args("input") input: LoginInput) {
    return this.authService.login(input);
  }
}
