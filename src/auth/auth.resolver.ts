import { Args, Mutation, Resolver } from "@nestjs/graphql";
import { Throttle } from "@nestjs/throttler";

import { RequestPasswordResetInput } from "@/auth/dto/request-password-reset.input";
import { RefreshSessionInput } from "@/auth/dto/refresh-session.input";
import { ResetPasswordInput } from "@/auth/dto/reset-password.input";
import { VerifyEmailInput } from "@/auth/dto/verify-email.input";
import { LogoutInput } from "@/auth/dto/logout.input";
import { LoginInput } from "@/auth/dto/login.input";
import { AuthPayload } from "@/auth/auth.payload";
import { AuthService } from "@/auth/auth.service";

import { CurrentUser } from "@/common/decorators/current-user.decorator";
import { THROTTLE_LIMITS } from "@/common/constants/throttle.constants";
import { MessageResponse } from "@/common/types/message-response.type";
import { Public } from "@/common/decorators/auth.decorator";

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

  @Throttle({ default: THROTTLE_LIMITS.MUTATION })
  @Mutation(() => MessageResponse, { name: "requestEmailVerification" })
  async requestEmailVerification(
    @CurrentUser() user: { id: number },
  ): Promise<MessageResponse> {
    return this.authService.requestEmailVerification(user.id);
  }

  @Public()
  @Throttle({ default: THROTTLE_LIMITS.MUTATION })
  @Mutation(() => MessageResponse, { name: "verifyEmail" })
  async verifyEmail(
    @Args("input") input: VerifyEmailInput,
  ): Promise<MessageResponse> {
    return this.authService.verifyEmail(input);
  }

  @Public()
  @Throttle({ default: THROTTLE_LIMITS.MUTATION })
  @Mutation(() => AuthPayload, { name: "refreshSession" })
  async refreshSession(
    @Args("input") input: RefreshSessionInput,
  ): Promise<AuthPayload> {
    return this.authService.refreshSession(input);
  }

  @Public()
  @Throttle({ default: THROTTLE_LIMITS.MUTATION })
  @Mutation(() => MessageResponse, { name: "logout" })
  async logout(@Args("input") input: LogoutInput): Promise<MessageResponse> {
    return this.authService.logout(input);
  }
}
