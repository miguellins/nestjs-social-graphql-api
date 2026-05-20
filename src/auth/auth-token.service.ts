import { Injectable, UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { JwtService } from "@nestjs/jwt";

import { GRAPHQL_ERROR_CODES } from "@/common/constants/graphql-error-code.constants";

import { AccountState } from "@/users/enums/account-state.enum";
import type { UserRole } from "@/users/enums/user-role.enum";

import { createHash, randomBytes } from "crypto";

@Injectable()
export class AuthTokenService {
  private readonly emailVerificationTtlMs: number;
  private readonly passwordResetTokenTtlMs: number;
  private readonly refreshSessionTtlMs: number;
  private static readonly ACCOUNT_SUSPENDED_MESSAGE =
    "This account is suspended";
  private static readonly ACCOUNT_DEACTIVATED_MESSAGE =
    "This account is deactivated";

  constructor(
    private readonly jwtService: JwtService,
    configService: ConfigService,
  ) {
    const verificationTtlHours =
      configService.get<number>("EMAIL_VERIFICATION_TTL_HOURS") ?? 24;
    const ttlMinutes =
      configService.get<number>("PASSWORD_RESET_TOKEN_TTL_MINUTES") ?? 30;
    const refreshTtlDays =
      configService.get<number>("REFRESH_SESSION_TTL_DAYS") ?? 30;

    this.emailVerificationTtlMs = verificationTtlHours * 60 * 60_000;
    this.passwordResetTokenTtlMs = ttlMinutes * 60_000;
    this.refreshSessionTtlMs = refreshTtlDays * 24 * 60 * 60_000;
  }

  /** Signs a short-lived access token for one authenticated user. */
  signAccessToken(
    userId: number,
    role: UserRole,
    sessionId?: number,
  ): Promise<string> {
    return this.jwtService.signAsync({ sub: userId, role, sid: sessionId });
  }

  /** Blocks suspended and deactivated accounts from authenticating or rotating sessions. */
  assertCanAuthenticate(accountState: AccountState): void {
    if (accountState === AccountState.SUSPENDED) {
      throw new UnauthorizedException({
        message: AuthTokenService.ACCOUNT_SUSPENDED_MESSAGE,
        code: GRAPHQL_ERROR_CODES.ACCOUNT_SUSPENDED,
      });
    }

    if (accountState === AccountState.DEACTIVATED) {
      throw new UnauthorizedException({
        message: AuthTokenService.ACCOUNT_DEACTIVATED_MESSAGE,
        code: GRAPHQL_ERROR_CODES.ACCOUNT_DEACTIVATED,
      });
    }
  }

  /** Builds a high-entropy token and returns both raw and stored-safe representations. */
  createPasswordResetToken() {
    const raw = randomBytes(32).toString("base64url");

    return {
      raw,
      hash: this.hashPasswordResetToken(raw),
    };
  }

  /** Derives the stable database lookup hash for a raw password reset token. */
  hashPasswordResetToken(token: string): string {
    return createHash("sha256").update(token, "utf8").digest("hex");
  }

  /** Builds a high-entropy token and returns both raw and stored-safe representations. */
  createEmailVerificationToken() {
    const raw = randomBytes(32).toString("base64url");

    return {
      raw,
      hash: this.hashEmailVerificationToken(raw),
    };
  }

  /** Derives the stable database lookup hash for a raw email verification token. */
  hashEmailVerificationToken(token: string): string {
    return createHash("sha256").update(token, "utf8").digest("hex");
  }

  /** Builds a high-entropy opaque refresh token and returns both raw and stored-safe representations. */
  createRefreshSessionToken() {
    const raw = randomBytes(32).toString("base64url");

    return {
      raw,
      hash: this.hashRefreshToken(raw),
    };
  }

  /** Derives the stable database lookup hash for a raw refresh token. */
  hashRefreshToken(token: string): string {
    return createHash("sha256").update(token, "utf8").digest("hex");
  }

  /** Computes the expiry timestamp for a newly issued refresh session. */
  buildRefreshSessionExpiry(): Date {
    return new Date(Date.now() + this.refreshSessionTtlMs);
  }

  /** Computes the expiry timestamp for a newly issued email verification token. */
  buildEmailVerificationExpiry(): Date {
    return new Date(Date.now() + this.emailVerificationTtlMs);
  }

  /** Computes the expiry timestamp for a newly issued password reset token. */
  buildPasswordResetTokenExpiry(): Date {
    return new Date(Date.now() + this.passwordResetTokenTtlMs);
  }
}
