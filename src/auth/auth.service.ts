import {
  BadRequestException,
  HttpException,
  Injectable,
  InternalServerErrorException,
  Logger,
  UnauthorizedException,
} from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";

import { loginCommandSchema } from "@/auth/schemas/login-command.schema";
import type { LoginCommand } from "@/auth/schemas/login-command.schema";

import { PasswordService } from "@/common/security/password.service";
import { parseWithBadRequest } from "@/common/zod/parse-with-zod";
import { runBestEffort } from "@/common/errors/run-best-effort";

import { PrismaService } from "@/prisma.service";

/**
 * Service for authentication workflows
 *
 * Validates credentials and issues access tokens
 */

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  // Injects dependencies used by the auth workflow
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly passwordService: PasswordService,
  ) {}

  // Validates credentials and returns an access token for a valid user
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

      // Keep legacy-hash upgrades from failing an otherwise successful login
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

      // Preserve already-sanitized HTTP errors instead of wrapping them again
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

  // Parses and normalizes login input before authentication logic runs
  private parseLoginInput(input: LoginCommand) {
    return parseWithBadRequest(
      loginCommandSchema,
      input,
      "Invalid login input",
    );
  }
}
