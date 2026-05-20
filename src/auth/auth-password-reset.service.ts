import { BadRequestException, Injectable, Logger } from "@nestjs/common";

import { AuthTokenService } from "@/auth/auth-token.service";
import { PasswordResetDeliveryService } from "@/auth/password-reset-delivery.service";
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

import { PrismaService } from "@/prisma/prisma.service";

@Injectable()
export class AuthPasswordResetService {
  private readonly logger = new Logger(AuthPasswordResetService.name);
  private static readonly PASSWORD_RESET_RESPONSE_MESSAGE =
    "If an account with that email exists, password reset instructions will be sent";
  private static readonly PASSWORD_RESET_SUCCESS_MESSAGE =
    "Password reset successful";

  constructor(
    private readonly prisma: PrismaService,
    private readonly passwordService: PasswordService,
    private readonly authTokenService: AuthTokenService,
    private readonly passwordResetDelivery: PasswordResetDeliveryService,
  ) {}

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
        message: AuthPasswordResetService.PASSWORD_RESET_RESPONSE_MESSAGE,
      };
    }

    const token = this.authTokenService.createPasswordResetToken();
    const expiresAt = this.authTokenService.buildPasswordResetTokenExpiry();

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
      message: AuthPasswordResetService.PASSWORD_RESET_RESPONSE_MESSAGE,
    };
  }

  async resetPassword(input: ResetPasswordCommand): Promise<MessageResponse> {
    const data = this.parseResetPasswordInput(input);
    const hashedPassword = await this.passwordService.hashPassword(
      data.newPassword,
    );
    const tokenHash = this.authTokenService.hashPasswordResetToken(data.token);
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
      message: AuthPasswordResetService.PASSWORD_RESET_SUCCESS_MESSAGE,
    };
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
}
