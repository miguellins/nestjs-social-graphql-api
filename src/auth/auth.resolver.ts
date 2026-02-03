import { Args, Mutation, Resolver } from "@nestjs/graphql";

import { LoginInput } from "./dto/login.input";

import { AuthPayload } from "./auth.payload";
import { AuthService } from "./auth.service";
import { Public } from "./auth.decorator";

@Resolver()
export class AuthResolver {
  constructor(private readonly authService: AuthService) { }

  @Public()
  @Mutation(() => AuthPayload)
  login(@Args("input") input: LoginInput) {
    return this.authService.login(input);
  }
}
