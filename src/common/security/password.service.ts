import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

import {
  PASSWORD_HASH_PREFIX,
  SALT_ROUNDS,
} from "@/common/constants/security.constants";

import { createHmac } from "crypto";

import * as bcrypt from "bcrypt";

/**
 * Centralizes password hashing and verification for the application
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
    const peppered = this.pepperPassword(password);
    const hash = await bcrypt.hash(peppered, SALT_ROUNDS);

    return `${PASSWORD_HASH_PREFIX}${hash}`;
  }

  // Verifies the stored password hash and upgrades legacy hashes when needed
  async verifyPassword(
    password: string,
    storedHash: string,
  ): Promise<PasswordVerificationResult> {
    if (this.isPepperedHash(storedHash)) {
      const isValid = await bcrypt.compare(
        this.pepperPassword(password),
        storedHash.slice(PASSWORD_HASH_PREFIX.length),
      );

      return { isValid };
    }

    const isLegacyValid = await bcrypt.compare(password, storedHash);

    if (!isLegacyValid) return { isValid: false };

    this.logger.log("Upgrading legacy bcrypt password hash to peppered format");

    return {
      isValid: true,
      upgradedHash: await this.hashPassword(password),
    };
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
