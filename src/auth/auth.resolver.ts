import { Args, Context, Int, Mutation, Query, Resolver } from "@nestjs/graphql";
import { Throttle } from "@nestjs/throttler";

import { RequestPasswordResetInput } from "@/auth/dto/request-password-reset.input";
import type { AuthSessionMetadata } from "@/auth/auth-session-metadata.type";
import type { AuthenticatedUser } from "@/auth/authenticated-user.type";
import { RefreshSessionInput } from "@/auth/dto/refresh-session.input";
import { ResetPasswordInput } from "@/auth/dto/reset-password.input";
import { VerifyEmailInput } from "@/auth/dto/verify-email.input";
import { AuthSessionService } from "@/auth/auth-session.service";
import { SessionInfo } from "@/auth/models/session-info.model";
import { LogoutInput } from "@/auth/dto/logout.input";
import { LoginInput } from "@/auth/dto/login.input";
import { AuthPayload } from "@/auth/auth.payload";
import { AuthService } from "@/auth/auth.service";

import { CurrentUser } from "@/common/decorators/current-user.decorator";
import { THROTTLE_LIMITS } from "@/common/constants/throttle.constants";
import { MessageResponse } from "@/common/types/message-response.type";
import { Public } from "@/common/decorators/auth.decorator";

import type { GqlContext } from "@/graphql/config/graphql-context.types";

@Resolver()
export class AuthResolver {
  constructor(
    private readonly authService: AuthService,
    private readonly authSessionService: AuthSessionService,
  ) {}

  @Public()
  @Throttle({ default: THROTTLE_LIMITS.SIGNUP })
  @Mutation(() => AuthPayload, { name: "login" })
  login(@Args("input") input: LoginInput, @Context() context: GqlContext) {
    return this.authService.login(input, this.getSessionMetadata(context));
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
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<MessageResponse> {
    return this.authService.requestEmailVerification(user.id);
  }

  @Throttle({ default: THROTTLE_LIMITS.LIST })
  @Query(() => [SessionInfo], { name: "mySessions" })
  async mySessions(
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<SessionInfo[]> {
    return this.authSessionService.mySessions(user);
  }

  @Throttle({ default: THROTTLE_LIMITS.MUTATION })
  @Mutation(() => MessageResponse, { name: "logoutCurrentSession" })
  async logoutCurrentSession(
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<MessageResponse> {
    return this.authSessionService.logoutCurrentSession(user);
  }

  @Throttle({ default: THROTTLE_LIMITS.MUTATION })
  @Mutation(() => MessageResponse, { name: "revokeSession" })
  async revokeSession(
    @CurrentUser() user: AuthenticatedUser,
    @Args("sessionId", { type: () => Int }) sessionId: number,
  ): Promise<MessageResponse> {
    return this.authSessionService.revokeSession(user, sessionId);
  }

  @Throttle({ default: THROTTLE_LIMITS.MUTATION })
  @Mutation(() => MessageResponse, { name: "revokeOtherSessions" })
  async revokeOtherSessions(
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<MessageResponse> {
    return this.authSessionService.revokeOtherSessions(user);
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
    @Context() context: GqlContext,
  ): Promise<AuthPayload> {
    return this.authService.refreshSession(
      input,
      this.getSessionMetadata(context),
    );
  }

  @Public()
  @Throttle({ default: THROTTLE_LIMITS.MUTATION })
  @Mutation(() => MessageResponse, { name: "logout" })
  async logout(@Args("input") input: LogoutInput): Promise<MessageResponse> {
    return this.authService.logout(input);
  }

  private getSessionMetadata(context: GqlContext): AuthSessionMetadata {
    const request = context.req;
    const forwarded = request?.headers["x-forwarded-for"];
    const forwardedIp = Array.isArray(forwarded)
      ? forwarded[0]
      : forwarded?.split(",")[0]?.trim();

    return {
      userAgent: request?.headers["user-agent"],
      ipAddress: forwardedIp || request?.ip || undefined,
    };
  }
}
