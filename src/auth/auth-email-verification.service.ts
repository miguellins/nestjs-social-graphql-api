import {
  BadRequestException,
  HttpException,
  Injectable,
  Logger,
  InternalServerErrorException,
  NotFoundException,
} from "@nestjs/common";

import { AuthTokenService } from "@/auth/auth-token.service";
import { EmailVerificationDeliveryService } from "@/auth/email-verification-delivery.service";
import {
  verifyEmailCommandSchema,
  type VerifyEmailCommand,
} from "@/auth/schemas/verify-email-command.schema";

import { MessageResponse } from "@/common/types/message-response.type";
import { parseWithBadRequest } from "@/common/zod/parse-with-zod";
import { runBestEffort } from "@/common/errors/run-best-effort";

import { PrismaService } from "@/prisma/prisma.service";

@Injectable()
export class AuthEmailVerificationService {
  private readonly logger = new Logger(AuthEmailVerificationService.name);
  private static readonly EMAIL_VERIFICATION_REQUEST_MESSAGE =
    "Verification instructions generated if your account is eligible.";
  private static readonly EMAIL_VERIFICATION_SUCCESS_MESSAGE =
    "Email verified successfully";

  constructor(
    private readonly prisma: PrismaService,
    private readonly authTokenService: AuthTokenService,
    private readonly emailVerificationDelivery: EmailVerificationDeliveryService,
  ) {}

  async requestEmailVerification(
    currentUserId: number,
  ): Promise<MessageResponse> {
    await this.assertCanUseAuthenticatedAuthFlow(currentUserId);

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
        message:
          AuthEmailVerificationService.EMAIL_VERIFICATION_REQUEST_MESSAGE,
      };
    }

    const token = this.authTokenService.createEmailVerificationToken();
    const expiresAt = this.authTokenService.buildEmailVerificationExpiry();

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
      message: AuthEmailVerificationService.EMAIL_VERIFICATION_REQUEST_MESSAGE,
    };
  }

  async verifyEmail(input: VerifyEmailCommand): Promise<MessageResponse> {
    const data = this.parseVerifyEmailInput(input);
    const tokenHash = this.authTokenService.hashEmailVerificationToken(
      data.token,
    );
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
      message: AuthEmailVerificationService.EMAIL_VERIFICATION_SUCCESS_MESSAGE,
    };
  }

  /** Parses and normalizes email verification confirmation input before token validation runs. */
  private parseVerifyEmailInput(input: VerifyEmailCommand) {
    return parseWithBadRequest(
      verifyEmailCommandSchema,
      input,
      "Invalid email verification input",
    );
  }

  /** Ensures authenticated auth flows like verification requests cannot run for disabled accounts. */
  private async assertCanUseAuthenticatedAuthFlow(
    currentUserId: number,
  ): Promise<void> {
    const user = await this.prisma.user.findUnique({
      where: { id: currentUserId },
      select: {
        accountState: true,
      },
    });

    if (!user) {
      throw new NotFoundException("Current user not found");
    }

    this.authTokenService.assertCanAuthenticate(user.accountState);
  }
}
