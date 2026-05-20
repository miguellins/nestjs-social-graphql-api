import { Injectable, Logger, UnauthorizedException } from "@nestjs/common";

import type { AuthSessionMetadata } from "@/auth/auth-session-metadata.type";
import { AuthCredentialService } from "@/auth/auth-credential.service";
import { AuthPayload } from "@/auth/auth.payload";
import { AuthTokenService } from "@/auth/auth-token.service";
import {
  refreshSessionCommandSchema,
  type RefreshSessionCommand,
} from "@/auth/schemas/refresh-session-command.schema";
import {
  logoutCommandSchema,
  type LogoutCommand,
} from "@/auth/schemas/logout-command.schema";
import { type LoginCommand } from "@/auth/schemas/login-command.schema";
import { type VerifyEmailCommand } from "@/auth/schemas/verify-email-command.schema";
import {
  type RequestPasswordResetCommand,
  type ResetPasswordCommand,
} from "@/auth/schemas/password-reset-command.schema";

import { MessageResponse } from "@/common/types/message-response.type";
import { parseWithBadRequest } from "@/common/zod/parse-with-zod";

import { AccountState } from "@/users/enums/account-state.enum";

import { PrismaService } from "@/prisma/prisma.service";

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  private static readonly LOGOUT_SUCCESS_MESSAGE = "Logged out successfully";
  private static readonly INVALID_REFRESH_TOKEN_MESSAGE =
    "Invalid refresh token";

  constructor(
    private readonly prisma: PrismaService,
    private readonly authCredentialService: AuthCredentialService,
    private readonly authTokenService: AuthTokenService,
  ) {}

  /** Delegates login credentials and session creation to the credential collaborator. */
  async login(
    input: LoginCommand,
    metadata?: AuthSessionMetadata,
  ): Promise<AuthPayload> {
    return this.authCredentialService.login(input, metadata);
  }

  /** Delegates password reset initiation to the credential collaborator. */
  async requestPasswordReset(
    input: RequestPasswordResetCommand,
  ): Promise<MessageResponse> {
    return this.authCredentialService.requestPasswordReset(input);
  }

  /** Delegates email verification initiation to the credential collaborator. */
  async requestEmailVerification(
    currentUserId: number,
  ): Promise<MessageResponse> {
    return this.authCredentialService.requestEmailVerification(currentUserId);
  }

  /** Delegates password reset confirmation to the credential collaborator. */
  async resetPassword(input: ResetPasswordCommand): Promise<MessageResponse> {
    return this.authCredentialService.resetPassword(input);
  }

  /** Delegates email verification confirmation to the credential collaborator. */
  async verifyEmail(input: VerifyEmailCommand): Promise<MessageResponse> {
    return this.authCredentialService.verifyEmail(input);
  }

  /** Rotates a refresh session and returns a new token pair. */
  async refreshSession(
    input: RefreshSessionCommand,
    metadata?: AuthSessionMetadata,
  ): Promise<AuthPayload> {
    const data = this.parseRefreshSessionInput(input);
    const tokenHash = this.authTokenService.hashRefreshToken(data.refreshToken);
    const now = new Date();
    const nextRefreshToken = this.authTokenService.createRefreshSessionToken();
    const nextExpiresAt = this.authTokenService.buildRefreshSessionExpiry();

    const sessionData = await this.prisma.$transaction(async (tx) => {
      const session = await tx.refreshSession.findFirst({
        where: {
          tokenHash,
          revokedAt: null,
          expiresAt: {
            gt: now,
          },
        },
        select: {
          id: true,
          userId: true,
          user: {
            select: {
              role: true,
              accountState: true,
            },
          },
        },
      });

      if (!session) {
        throw new UnauthorizedException(
          AuthService.INVALID_REFRESH_TOKEN_MESSAGE,
        );
      }

      if (session.user.accountState !== AccountState.ACTIVE) {
        await tx.refreshSession.updateMany({
          where: {
            userId: session.userId,
            revokedAt: null,
          },
          data: {
            revokedAt: now,
          },
        });

        this.logger.warn(
          `Revoked active sessions during refresh for inactive userId=${session.userId}`,
        );

        this.authTokenService.assertCanAuthenticate(session.user.accountState);
      }

      const rotated = await tx.refreshSession.updateMany({
        where: {
          id: session.id,
          tokenHash,
          revokedAt: null,
          expiresAt: {
            gt: now,
          },
        },
        data: {
          tokenHash: nextRefreshToken.hash,
          expiresAt: nextExpiresAt,
          lastUsedAt: now,
          userAgent: metadata?.userAgent,
          ipAddress: metadata?.ipAddress,
        },
      });

      if (rotated.count !== 1) {
        throw new UnauthorizedException(
          AuthService.INVALID_REFRESH_TOKEN_MESSAGE,
        );
      }

      return {
        sessionId: session.id,
        userId: session.userId,
        role: session.user.role,
      };
    });

    this.logger.log(
      `Refresh session rotated for userId=${sessionData.userId} sessionId=${sessionData.sessionId}`,
    );

    return {
      access_token: await this.authTokenService.signAccessToken(
        sessionData.userId,
        sessionData.role,
        sessionData.sessionId,
      ),
      refreshToken: nextRefreshToken.raw,
    };
  }

  /** Revokes a refresh session token for logout. */
  async logout(input: LogoutCommand): Promise<MessageResponse> {
    const data = this.parseLogoutInput(input);
    const tokenHash = this.authTokenService.hashRefreshToken(data.refreshToken);

    await this.prisma.refreshSession.updateMany({
      where: {
        tokenHash,
        revokedAt: null,
      },
      data: {
        revokedAt: new Date(),
      },
    });

    this.logger.log("Processed refresh-session logout request");

    return {
      message: AuthService.LOGOUT_SUCCESS_MESSAGE,
    };
  }

  /** Parses and normalizes refresh-session input before token rotation logic runs. */
  private parseRefreshSessionInput(input: RefreshSessionCommand) {
    return parseWithBadRequest(
      refreshSessionCommandSchema,
      input,
      "Invalid refresh session input",
    );
  }

  /** Parses and normalizes logout input before session revocation runs. */
  private parseLogoutInput(input: LogoutCommand) {
    return parseWithBadRequest(
      logoutCommandSchema,
      input,
      "Invalid logout input",
    );
  }
}
