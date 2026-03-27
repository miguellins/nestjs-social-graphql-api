import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

import { writeFile } from "fs/promises";

import { join } from "path";

/**
 * Auth-scoped password reset delivery seam
 *
 * Keeps token delivery pluggable without coupling the auth flow to a mail provider
 */

type PasswordResetDeliveryParams = {
  email: string;
  token: string;
  expiresAt: Date;
};

@Injectable()
export class PasswordResetDeliveryService {
  private readonly logger = new Logger(PasswordResetDeliveryService.name);
  private static readonly DEV_PASSWORD_RESET_FILE = join(
    "/tmp",
    "nestjs-graphql-password-reset.json",
  );

  constructor(private readonly configService: ConfigService) {}

  async sendPasswordResetInstructions({
    email,
    token,
    expiresAt,
  }: PasswordResetDeliveryParams): Promise<void> {
    const nodeEnv = this.configService.get<string>("NODE_ENV") ?? "development";

    if (nodeEnv === "development" || nodeEnv === "test") {
      await writeFile(
        PasswordResetDeliveryService.DEV_PASSWORD_RESET_FILE,
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
        `Password reset instructions written to ${PasswordResetDeliveryService.DEV_PASSWORD_RESET_FILE}`,
      );

      return;
    }

    this.logger.warn(
      `Password reset delivery is not configured. Generated instructions expire at ${expiresAt.toISOString()}.`,
    );
  }
}
