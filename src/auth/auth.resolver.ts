import { Args, Mutation, Resolver } from "@nestjs/graphql";
import { Throttle } from "@nestjs/throttler";

import { THROTTLE_LIMITS } from "@/common/constants/throttle.constants";
import { Public } from "@/common/decorators/auth.decorator";

import { LoginInput } from "@/auth/dto/login.input";
import { AuthPayload } from "@/auth/auth.payload";
import { AuthService } from "@/auth/auth.service";

@Resolver()
export class AuthResolver {
  constructor(private readonly authService: AuthService) {}

  @Public()
  @Throttle({ default: THROTTLE_LIMITS.SIGNUP })
  @Mutation(() => AuthPayload, { name: "login" })
  login(@Args("input") input: LoginInput) {
    return this.authService.login(input);
  }
}
