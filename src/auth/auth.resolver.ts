import { Args, Mutation, Resolver } from "@nestjs/graphql";
import { Throttle } from "@nestjs/throttler";

import { RequestPasswordResetInput } from "@/auth/dto/request-password-reset.input";
import { ResetPasswordInput } from "@/auth/dto/reset-password.input";
import { LoginInput } from "@/auth/dto/login.input";
import { AuthPayload } from "@/auth/auth.payload";
import { AuthService } from "@/auth/auth.service";

import { THROTTLE_LIMITS } from "@/common/constants/throttle.constants";
import { MessageResponse } from "@/common/types/message-response.type";
import { Public } from "@/common/decorators/auth.decorator";

/**
 * GraphQL resolver for authentication
 *
 * Exposes authentication and password reset mutations
 */

@Resolver()
export class AuthResolver {
  constructor(private readonly authService: AuthService) {}

  @Public()
  @Throttle({ default: THROTTLE_LIMITS.SIGNUP })
  @Mutation(() => AuthPayload, { name: "login" })
  login(@Args("input") input: LoginInput) {
    return this.authService.login(input);
  }

  @Public()
  @Throttle({ default: THROTTLE_LIMITS.SIGNUP })
  @Mutation(() => MessageResponse, { name: "requestPasswordReset" })
  async requestPasswordReset(
    @Args("input") input: RequestPasswordResetInput,
  ): Promise<MessageResponse> {
    return this.authService.requestPasswordReset(input);
  }

  @Public()
  @Throttle({ default: THROTTLE_LIMITS.SIGNUP })
  @Mutation(() => MessageResponse, { name: "resetPassword" })
  async resetPassword(
    @Args("input") input: ResetPasswordInput,
  ): Promise<MessageResponse> {
    return this.authService.resetPassword(input);
  }
}
