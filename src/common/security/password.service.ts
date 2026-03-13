import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

import { PASSWORD_HASH_PREFIX, SALT_ROUNDS } from "@/common/constants/security.constants";

import * as bcrypt from "bcrypt";

import { createHmac } from "crypto";

type PasswordVerificationResult = {
  isValid: boolean;
  upgradedHash?: string;
};

@Injectable()
export class PasswordService {
  private readonly logger = new Logger(PasswordService.name);
  private readonly pepper: string;

  constructor(private readonly configService: ConfigService) {
    const pepper = this.configService.get<string>("PASSWORD_PEPPER");

    if (!pepper) throw new Error("PASSWORD_PEPPER is not defined");

    this.pepper = pepper;
  }

  async hashPassword(password: string): Promise<string> {
    const peppered = this.pepperPassword(password);
    const hash = await bcrypt.hash(peppered, SALT_ROUNDS);

    return `${PASSWORD_HASH_PREFIX}${hash}`;
  }

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

  private isPepperedHash(hash: string): boolean {
    return hash.startsWith(PASSWORD_HASH_PREFIX);
  }

  private pepperPassword(password: string): string {
    return createHmac("sha256", this.pepper)
      .update(password, "utf8")
      .digest("hex");
  }
}
