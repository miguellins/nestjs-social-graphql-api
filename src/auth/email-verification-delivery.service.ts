import {
  Injectable,
  InternalServerErrorException,
  Logger,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

import { writeFile } from "fs/promises";

import { join } from "path";

type EmailVerificationDeliveryParams = {
  email: string;
  token: string;
  expiresAt: Date;
};

@Injectable()
export class EmailVerificationDeliveryService {
  private readonly logger = new Logger(EmailVerificationDeliveryService.name);
  private static readonly DEV_EMAIL_VERIFICATION_FILE = join(
    "/tmp",
    "nestjs-graphql-email-verification.json",
  );

  constructor(private readonly configService: ConfigService) {}

  /** Emits email verification instructions using the environment-appropriate delivery strategy. */
  async sendEmailVerificationInstructions({
    email,
    token,
    expiresAt,
  }: EmailVerificationDeliveryParams): Promise<void> {
    const nodeEnv = this.configService.get<string>("NODE_ENV") ?? "development";

    if (nodeEnv === "development" || nodeEnv === "test") {
      await writeFile(
        EmailVerificationDeliveryService.DEV_EMAIL_VERIFICATION_FILE,
        JSON.stringify(
          {
            email,
            token,
            expiresAt: expiresAt.toISOString(),
          },
          null,
          2,
        ),
        {
          encoding: "utf8",
          mode: 0o600,
        },
      );

      this.logger.log(
        `Email verification instructions written to ${EmailVerificationDeliveryService.DEV_EMAIL_VERIFICATION_FILE}`,
      );

      return;
    }

    this.logger.warn(
      `Email verification delivery is not configured. Generated instructions expire at ${expiresAt.toISOString()}.`,
    );

    throw new InternalServerErrorException(
      "Email verification delivery is not configured",
    );
  }
}
