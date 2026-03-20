import {
  Injectable,
  InternalServerErrorException,
  Logger,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

import {
  PASSWORD_HASH_PREFIX,
  SALT_ROUNDS,
} from "@/common/constants/security.constants";

import { createHmac } from "crypto";

import * as bcrypt from "bcrypt";

/**
 * Password security service
 *
 * Hashes and verifies passwords with pepper support
 */

type PasswordVerificationResult = {
  isValid: boolean;
  upgradedHash?: string;
};

@Injectable()
export class PasswordService {
  private readonly logger = new Logger(PasswordService.name);
  private readonly pepper: string;

  // Loads the password pepper from validated configuration
  constructor(private readonly configService: ConfigService) {
    const pepper = this.configService.get<string>("PASSWORD_PEPPER");

    if (!pepper) throw new Error("PASSWORD_PEPPER is not defined");

    this.pepper = pepper;
  }

  // Hashes a password with HMAC peppering and bcrypt
  async hashPassword(password: string): Promise<string> {
    try {
      const peppered = this.pepperPassword(password);
      const hash = await bcrypt.hash(peppered, SALT_ROUNDS);

      return `${PASSWORD_HASH_PREFIX}${hash}`;
    } catch (error) {
      // Hide bcrypt internals from callers while keeping an operational log
      this.logger.error(
        "Failed to hash password",
        error instanceof Error ? error.stack : undefined,
      );

      throw new InternalServerErrorException("Password processing failed");
    }
  }

  // Verifies the stored password hash and upgrades legacy hashes when needed
  async verifyPassword(
    password: string,
    storedHash: string,
  ): Promise<PasswordVerificationResult> {
    try {
      if (this.isPepperedHash(storedHash)) {
        const isValid = await bcrypt.compare(
          this.pepperPassword(password),
          storedHash.slice(PASSWORD_HASH_PREFIX.length),
        );

        return { isValid };
      }

      const isLegacyValid = await bcrypt.compare(password, storedHash);

      if (!isLegacyValid) return { isValid: false };

      this.logger.log(
        "Upgrading legacy bcrypt password hash to peppered format",
      );

      return {
        isValid: true,
        upgradedHash: await this.hashPassword(password),
      };
    } catch (error) {
      // Re-throw the sanitized hashing failure produced during legacy-hash upgrades
      if (error instanceof InternalServerErrorException) {
        throw error;
      }

      // Hide bcrypt internals from callers while keeping an operational log
      this.logger.error(
        "Failed to verify password",
        error instanceof Error ? error.stack : undefined,
      );

      throw new InternalServerErrorException("Password processing failed");
    }
  }

  // Detects whether a stored hash already uses the peppered format
  private isPepperedHash(hash: string): boolean {
    return hash.startsWith(PASSWORD_HASH_PREFIX);
  }

  // Applies the configured pepper before bcrypt processing
  private pepperPassword(password: string): string {
    return createHmac("sha256", this.pepper)
      .update(password, "utf8")
      .digest("hex");
  }
}
