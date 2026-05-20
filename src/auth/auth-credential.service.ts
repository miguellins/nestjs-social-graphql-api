import {
  BadRequestException,
  HttpException,
  Injectable,
  InternalServerErrorException,
  Logger,
  UnauthorizedException,
} from "@nestjs/common";

import { AuthEmailVerificationService } from "@/auth/auth-email-verification.service";
import { AuthPasswordResetService } from "@/auth/auth-password-reset.service";
import type { AuthSessionMetadata } from "@/auth/auth-session-metadata.type";
import { AuthPayload } from "@/auth/auth.payload";
import { AuthTokenService } from "@/auth/auth-token.service";
import {
  loginCommandSchema,
  type LoginCommand,
} from "@/auth/schemas/login-command.schema";
import { type VerifyEmailCommand } from "@/auth/schemas/verify-email-command.schema";
import {
  type RequestPasswordResetCommand,
  type ResetPasswordCommand,
} from "@/auth/schemas/password-reset-command.schema";

import { MessageResponse } from "@/common/types/message-response.type";
import { PasswordService } from "@/common/security/password.service";
import { parseWithBadRequest } from "@/common/zod/parse-with-zod";
import { runBestEffort } from "@/common/errors/run-best-effort";

import { PrismaService } from "@/prisma/prisma.service";

@Injectable()
export class AuthCredentialService {
  private readonly logger = new Logger(AuthCredentialService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly passwordService: PasswordService,
    private readonly authTokenService: AuthTokenService,
    private readonly authEmailVerificationService: AuthEmailVerificationService,
    private readonly authPasswordResetService: AuthPasswordResetService,
  ) {}

  async login(
    input: LoginCommand,
    metadata?: AuthSessionMetadata,
  ): Promise<AuthPayload> {
    const credentials = this.parseLoginInput(input);

    try {
      const user = await this.prisma.user.findUnique({
        where: { username: credentials.username },
        select: {
          id: true,
          username: true,
          password: true,
          role: true,
          accountState: true,
        },
      });

      if (!user) throw new UnauthorizedException("Invalid credentials");

      this.authTokenService.assertCanAuthenticate(user.accountState);

      const verification = await this.passwordService.verifyPassword(
        credentials.password,
        user.password,
      );

      if (!verification.isValid) {
        throw new UnauthorizedException("Invalid credentials");
      }

      if (verification.upgradedHash) {
        await runBestEffort(
          this.logger,
          "warn",
          `Failed to upgrade legacy password hash for userId=${user.id}`,
          async () => {
            await this.prisma.user.update({
              where: { id: user.id },
              data: { password: verification.upgradedHash },
            });
          },
        );
      }

      const refreshToken = this.authTokenService.createRefreshSessionToken();
      const expiresAt = this.authTokenService.buildRefreshSessionExpiry();
      const refreshSession = await this.prisma.refreshSession.create({
        data: {
          userId: user.id,
          tokenHash: refreshToken.hash,
          expiresAt,
          lastUsedAt: new Date(),
          userAgent: metadata?.userAgent,
          ipAddress: metadata?.ipAddress,
        },
        select: {
          id: true,
        },
      });

      this.logger.log(
        `Login succeeded for userId=${user.id} sessionId=${refreshSession.id}`,
      );

      return {
        access_token: await this.authTokenService.signAccessToken(
          user.id,
          user.role,
          refreshSession.id,
        ),
        refreshToken: refreshToken.raw,
      };
    } catch (err) {
      if (
        err instanceof UnauthorizedException ||
        err instanceof BadRequestException
      ) {
        throw err;
      }

      if (err instanceof HttpException) {
        throw err;
      }

      this.logger.error(
        "Unexpected login failure",
        err instanceof Error ? err.stack : undefined,
      );

      throw new InternalServerErrorException("Login failed");
    }
  }

  /** Delegates password reset initiation to the password-reset collaborator. */
  async requestPasswordReset(
    input: RequestPasswordResetCommand,
  ): Promise<MessageResponse> {
    return this.authPasswordResetService.requestPasswordReset(input);
  }

  /** Delegates email verification initiation to the email-verification collaborator. */
  async requestEmailVerification(
    currentUserId: number,
  ): Promise<MessageResponse> {
    return this.authEmailVerificationService.requestEmailVerification(
      currentUserId,
    );
  }

  /** Delegates password reset confirmation to the password-reset collaborator. */
  async resetPassword(input: ResetPasswordCommand): Promise<MessageResponse> {
    return this.authPasswordResetService.resetPassword(input);
  }

  /** Delegates email verification confirmation to the email-verification collaborator. */
  async verifyEmail(input: VerifyEmailCommand): Promise<MessageResponse> {
    return this.authEmailVerificationService.verifyEmail(input);
  }

  /** Parses and normalizes login input before authentication logic runs. */
  private parseLoginInput(input: LoginCommand) {
    return parseWithBadRequest(
      loginCommandSchema,
      input,
      "Invalid login input",
    );
  }
}
