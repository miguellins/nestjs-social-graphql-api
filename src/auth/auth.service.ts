import {
  BadRequestException,
  HttpException,
  Injectable,
  InternalServerErrorException,
  Logger,
  UnauthorizedException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { JwtService } from "@nestjs/jwt";

import {
  loginCommandSchema,
  type LoginCommand,
} from "@/auth/schemas/login-command.schema";
import {
  requestPasswordResetCommandSchema,
  resetPasswordCommandSchema,
  type RequestPasswordResetCommand,
  type ResetPasswordCommand,
} from "@/auth/schemas/password-reset-command.schema";
import { PasswordResetDeliveryService } from "@/auth/password-reset-delivery.service";

import { MessageResponse } from "@/common/types/message-response.type";
import { PasswordService } from "@/common/security/password.service";
import { parseWithBadRequest } from "@/common/zod/parse-with-zod";
import { runBestEffort } from "@/common/errors/run-best-effort";

import { PrismaService } from "@/prisma/prisma.service";

import { createHash, randomBytes } from "crypto";

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  private readonly passwordResetTokenTtlMs: number;
  private static readonly PASSWORD_RESET_RESPONSE_MESSAGE =
    "If an account with that email exists, password reset instructions will be sent";
  private static readonly PASSWORD_RESET_SUCCESS_MESSAGE =
    "Password reset successful";

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly passwordService: PasswordService,
    private readonly passwordResetDelivery: PasswordResetDeliveryService,
    private readonly configService: ConfigService,
  ) {
    const ttlMinutes =
      this.configService.get<number>("PASSWORD_RESET_TOKEN_TTL_MINUTES") ?? 30;

    this.passwordResetTokenTtlMs = ttlMinutes * 60_000;
  }

  async login(input: LoginCommand) {
    const credentials = this.parseLoginInput(input);

    try {
      const user = await this.prisma.user.findUnique({
        where: { username: credentials.username },
        select: { id: true, username: true, password: true },
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

      const payload = { sub: user.id };

      return {
        access_token: await this.jwtService.signAsync(payload),
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
}
