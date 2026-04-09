import {
  BadRequestException,
  HttpException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { JwtService } from "@nestjs/jwt";

import { EmailVerificationDeliveryService } from "@/auth/email-verification-delivery.service";
import { PasswordResetDeliveryService } from "@/auth/password-reset-delivery.service";
import { AuthPayload } from "@/auth/auth.payload";
import {
  loginCommandSchema,
  type LoginCommand,
} from "@/auth/schemas/login-command.schema";
import {
  verifyEmailCommandSchema,
  type VerifyEmailCommand,
} from "@/auth/schemas/verify-email-command.schema";
import {
  refreshSessionCommandSchema,
  type RefreshSessionCommand,
} from "@/auth/schemas/refresh-session-command.schema";
import {
  logoutCommandSchema,
  type LogoutCommand,
} from "@/auth/schemas/logout-command.schema";
import {
  requestPasswordResetCommandSchema,
  resetPasswordCommandSchema,
  type RequestPasswordResetCommand,
  type ResetPasswordCommand,
} from "@/auth/schemas/password-reset-command.schema";

import { MessageResponse } from "@/common/types/message-response.type";
import { PasswordService } from "@/common/security/password.service";
import { parseWithBadRequest } from "@/common/zod/parse-with-zod";
import { runBestEffort } from "@/common/errors/run-best-effort";

import type { UserRole } from "@/users/enums/user-role.enum";

import { PrismaService } from "@/prisma/prisma.service";

import { createHash, randomBytes } from "crypto";

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  private readonly emailVerificationTtlMs: number;
  private readonly passwordResetTokenTtlMs: number;
  private readonly refreshSessionTtlMs: number;
  private static readonly EMAIL_VERIFICATION_REQUEST_MESSAGE =
    "Verification instructions generated if your account is eligible.";
  private static readonly EMAIL_VERIFICATION_SUCCESS_MESSAGE =
    "Email verified successfully";
  private static readonly PASSWORD_RESET_RESPONSE_MESSAGE =
    "If an account with that email exists, password reset instructions will be sent";
  private static readonly PASSWORD_RESET_SUCCESS_MESSAGE =
    "Password reset successful";
  private static readonly LOGOUT_SUCCESS_MESSAGE = "Logged out successfully";
  private static readonly INVALID_REFRESH_TOKEN_MESSAGE =
    "Invalid refresh token";

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly passwordService: PasswordService,
    private readonly emailVerificationDelivery: EmailVerificationDeliveryService,
    private readonly passwordResetDelivery: PasswordResetDeliveryService,
    private readonly configService: ConfigService,
  ) {
    const verificationTtlHours =
      this.configService.get<number>("EMAIL_VERIFICATION_TTL_HOURS") ?? 24;
    const ttlMinutes =
      this.configService.get<number>("PASSWORD_RESET_TOKEN_TTL_MINUTES") ?? 30;
    const refreshTtlDays =
      this.configService.get<number>("REFRESH_SESSION_TTL_DAYS") ?? 30;

    this.emailVerificationTtlMs = verificationTtlHours * 60 * 60_000;
    this.passwordResetTokenTtlMs = ttlMinutes * 60_000;
    this.refreshSessionTtlMs = refreshTtlDays * 24 * 60 * 60_000;
  }

  async login(input: LoginCommand): Promise<AuthPayload> {
    const credentials = this.parseLoginInput(input);

    try {
      const user = await this.prisma.user.findUnique({
        where: { username: credentials.username },
        select: { id: true, username: true, password: true, role: true },
      });

      if (!user) throw new UnauthorizedException("Invalid credentials");

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

      const refreshToken = this.createRefreshSessionToken();
      const expiresAt = this.buildRefreshSessionExpiry();

      await this.prisma.refreshSession.create({
        data: {
          userId: user.id,
          tokenHash: refreshToken.hash,
          expiresAt,
        },
      });

      return {
        access_token: await this.signAccessToken(user.id, user.role),
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

  async requestPasswordReset(
    input: RequestPasswordResetCommand,
  ): Promise<MessageResponse> {
    const data = this.parseRequestPasswordResetInput(input);

    const user = await this.prisma.user.findUnique({
      where: { email: data.email },
      select: { id: true, email: true },
    });

    if (!user) {
      return {
        message: AuthService.PASSWORD_RESET_RESPONSE_MESSAGE,
      };
    }

    const token = this.createPasswordResetToken();
    const expiresAt = new Date(Date.now() + this.passwordResetTokenTtlMs);

    await this.prisma.$transaction([
      this.prisma.passwordResetToken.deleteMany({
        where: { userId: user.id },
      }),
      this.prisma.passwordResetToken.create({
        data: {
          userId: user.id,
          tokenHash: token.hash,
          expiresAt,
        },
      }),
    ]);

    await runBestEffort(
      this.logger,
      "warn",
      "Failed to dispatch password reset instructions",
      async () => {
        await this.passwordResetDelivery.sendPasswordResetInstructions({
          email: user.email,
          token: token.raw,
          expiresAt,
        });
      },
    );

    return {
      message: AuthService.PASSWORD_RESET_RESPONSE_MESSAGE,
    };
  }

  async requestEmailVerification(
    currentUserId: number,
  ): Promise<MessageResponse> {
    const user = await this.prisma.user.findUnique({
      where: { id: currentUserId },
      select: {
        id: true,
        email: true,
        isEmailVerified: true,
      },
    });

    if (!user) {
      throw new NotFoundException("Current user not found");
    }

    if (user.isEmailVerified) {
      return {
        message: AuthService.EMAIL_VERIFICATION_REQUEST_MESSAGE,
      };
    }

    const token = this.createEmailVerificationToken();
    const expiresAt = this.buildEmailVerificationExpiry();

    await this.prisma.$transaction([
      this.prisma.emailVerificationToken.deleteMany({
        where: {
          userId: user.id,
          usedAt: null,
        },
      }),
      this.prisma.emailVerificationToken.create({
        data: {
          userId: user.id,
          tokenHash: token.hash,
          expiresAt,
        },
      }),
    ]);

    try {
      await this.emailVerificationDelivery.sendEmailVerificationInstructions({
        email: user.email,
        token: token.raw,
        expiresAt,
      });
    } catch (err) {
      await runBestEffort(
        this.logger,
        "warn",
        `Failed to clean up email verification token after delivery error for userId=${user.id}`,
        async () => {
          await this.prisma.emailVerificationToken.deleteMany({
            where: {
              userId: user.id,
              tokenHash: token.hash,
              usedAt: null,
            },
          });
        },
      );

      if (err instanceof HttpException) {
        throw err;
      }

      throw new InternalServerErrorException(
        "Email verification delivery failed",
      );
    }

    return {
      message: AuthService.EMAIL_VERIFICATION_REQUEST_MESSAGE,
    };
  }

  async resetPassword(input: ResetPasswordCommand): Promise<MessageResponse> {
    const data = this.parseResetPasswordInput(input);
    const hashedPassword = await this.passwordService.hashPassword(
      data.newPassword,
    );
    const tokenHash = this.hashPasswordResetToken(data.token);
    const now = new Date();

    await this.prisma.$transaction(async (tx) => {
      const resetToken = await tx.passwordResetToken.findUnique({
        where: { tokenHash },
        select: {
          id: true,
          userId: true,
          expiresAt: true,
          usedAt: true,
        },
      });

      if (!resetToken) {
        throw new BadRequestException("Invalid password reset token");
      }

      if (resetToken.usedAt) {
        throw new BadRequestException(
          "Password reset token has already been used",
        );
      }

      if (resetToken.expiresAt.getTime() <= now.getTime()) {
        throw new BadRequestException("Password reset token has expired");
      }

      const consumed = await tx.passwordResetToken.updateMany({
        where: {
          id: resetToken.id,
          usedAt: null,
          expiresAt: {
            gt: now,
          },
        },
        data: {
          usedAt: now,
        },
      });

      if (consumed.count !== 1) {
        throw new BadRequestException(
          "Password reset token is no longer valid",
        );
      }

      await tx.user.update({
        where: { id: resetToken.userId },
        data: { password: hashedPassword },
      });

      await tx.passwordResetToken.deleteMany({
        where: {
          userId: resetToken.userId,
          id: { not: resetToken.id },
        },
      });
    });

    return {
      message: AuthService.PASSWORD_RESET_SUCCESS_MESSAGE,
    };
  }

  async verifyEmail(input: VerifyEmailCommand): Promise<MessageResponse> {
    const data = this.parseVerifyEmailInput(input);
    const tokenHash = this.hashEmailVerificationToken(data.token);
    const now = new Date();

    await this.prisma.$transaction(async (tx) => {
      const verificationToken = await tx.emailVerificationToken.findUnique({
        where: { tokenHash },
        select: {
          id: true,
          userId: true,
          expiresAt: true,
          usedAt: true,
        },
      });

      if (!verificationToken) {
        throw new BadRequestException("Invalid email verification token");
      }

      if (verificationToken.usedAt) {
        throw new BadRequestException(
          "Email verification token has already been used",
        );
      }

      if (verificationToken.expiresAt.getTime() <= now.getTime()) {
        throw new BadRequestException("Email verification token has expired");
      }

      const consumed = await tx.emailVerificationToken.updateMany({
        where: {
          id: verificationToken.id,
          usedAt: null,
          expiresAt: {
            gt: now,
          },
        },
        data: {
          usedAt: now,
        },
      });

      if (consumed.count !== 1) {
        throw new BadRequestException(
          "Email verification token is no longer valid",
        );
      }

      await tx.user.update({
        where: { id: verificationToken.userId },
        data: { isEmailVerified: true },
      });

      await tx.emailVerificationToken.deleteMany({
        where: {
          userId: verificationToken.userId,
          id: { not: verificationToken.id },
          usedAt: null,
        },
      });
    });

    return {
      message: AuthService.EMAIL_VERIFICATION_SUCCESS_MESSAGE,
    };
  }

  async refreshSession(input: RefreshSessionCommand): Promise<AuthPayload> {
    const data = this.parseRefreshSessionInput(input);
    const tokenHash = this.hashRefreshToken(data.refreshToken);
    const now = new Date();
    const nextRefreshToken = this.createRefreshSessionToken();
    const nextExpiresAt = this.buildRefreshSessionExpiry();

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
            },
          },
        },
      });

      if (!session) {
        throw new UnauthorizedException(
          AuthService.INVALID_REFRESH_TOKEN_MESSAGE,
        );
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
          revokedAt: now,
        },
      });

      if (rotated.count !== 1) {
        throw new UnauthorizedException(
          AuthService.INVALID_REFRESH_TOKEN_MESSAGE,
        );
      }

      const replacement = await tx.refreshSession.create({
        data: {
          userId: session.userId,
          tokenHash: nextRefreshToken.hash,
          expiresAt: nextExpiresAt,
        },
        select: {
          id: true,
        },
      });

      await tx.refreshSession.updateMany({
        where: {
          id: session.id,
          replacedBySessionId: null,
        },
        data: {
          replacedBySessionId: replacement.id,
        },
      });

      return {
        userId: session.userId,
        role: session.user.role,
      };
    });

    return {
      access_token: await this.signAccessToken(
        sessionData.userId,
        sessionData.role,
      ),
      refreshToken: nextRefreshToken.raw,
    };
  }

  async logout(input: LogoutCommand): Promise<MessageResponse> {
    const data = this.parseLogoutInput(input);
    const tokenHash = this.hashRefreshToken(data.refreshToken);

    await this.prisma.refreshSession.updateMany({
      where: {
        tokenHash,
        revokedAt: null,
      },
      data: {
        revokedAt: new Date(),
      },
    });

    return {
      message: AuthService.LOGOUT_SUCCESS_MESSAGE,
    };
  }

  // Private Helpers
  /** Parses and normalizes login input before authentication logic runs. */
  private parseLoginInput(input: LoginCommand) {
    return parseWithBadRequest(
      loginCommandSchema,
      input,
      "Invalid login input",
    );
  }

  /** Parses and normalizes reset initiation input before persistence logic runs. */
  private parseRequestPasswordResetInput(input: RequestPasswordResetCommand) {
    return parseWithBadRequest(
      requestPasswordResetCommandSchema,
      input,
      "Invalid password reset request",
    );
  }

  /** Parses and normalizes reset confirmation input before token validation runs. */
  private parseResetPasswordInput(input: ResetPasswordCommand) {
    return parseWithBadRequest(
      resetPasswordCommandSchema,
      input,
      "Invalid password reset input",
    );
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

  /** Parses and normalizes email verification confirmation input before token validation runs. */
  private parseVerifyEmailInput(input: VerifyEmailCommand) {
    return parseWithBadRequest(
      verifyEmailCommandSchema,
      input,
      "Invalid email verification input",
    );
  }

  /** Signs a short-lived access token for one authenticated user. */
  private signAccessToken(userId: number, role: UserRole): Promise<string> {
    return this.jwtService.signAsync({ sub: userId, role });
  }

  /** Builds a high-entropy token and returns both raw and stored-safe representations. */
  private createPasswordResetToken() {
    const raw = randomBytes(32).toString("base64url");

    return {
      raw,
      hash: this.hashPasswordResetToken(raw),
    };
  }

  /** Derives the stable database lookup hash for a raw password reset token. */
  private hashPasswordResetToken(token: string): string {
    return createHash("sha256").update(token, "utf8").digest("hex");
  }

  /** Builds a high-entropy token and returns both raw and stored-safe representations. */
  private createEmailVerificationToken() {
    const raw = randomBytes(32).toString("base64url");

    return {
      raw,
      hash: this.hashEmailVerificationToken(raw),
    };
  }

  /** Derives the stable database lookup hash for a raw email verification token. */
  private hashEmailVerificationToken(token: string): string {
    return createHash("sha256").update(token, "utf8").digest("hex");
  }

  /** Builds a high-entropy opaque refresh token and returns both raw and stored-safe representations. */
  private createRefreshSessionToken() {
    const raw = randomBytes(32).toString("base64url");

    return {
      raw,
      hash: this.hashRefreshToken(raw),
    };
  }

  /** Derives the stable database lookup hash for a raw refresh token. */
  private hashRefreshToken(token: string): string {
    return createHash("sha256").update(token, "utf8").digest("hex");
  }

  /** Computes the expiry timestamp for a newly issued refresh session. */
  private buildRefreshSessionExpiry(): Date {
    return new Date(Date.now() + this.refreshSessionTtlMs);
  }

  /** Computes the expiry timestamp for a newly issued email verification token. */
  private buildEmailVerificationExpiry(): Date {
    return new Date(Date.now() + this.emailVerificationTtlMs);
  }
}
