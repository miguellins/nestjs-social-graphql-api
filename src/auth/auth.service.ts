import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  Logger,
  UnauthorizedException,
} from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";

import { PasswordService } from "@/common/security/password.service";

import { PrismaService } from "@/prisma.service";
import { Prisma } from "@prisma/client";

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly passwordService: PasswordService,
  ) { }

  async login(input: { username: string; password: string }) {
    const username = input.username?.trim().toLowerCase();
    const password = input.password?.trim();

    // Fail fast (keeps service predictable + avoids weird edge cases)
    if (!username) throw new BadRequestException("Username is required");
    if (!password) throw new BadRequestException("Password is required");

    try {
      const user = await this.prisma.user.findUnique({
        where: { username },
        select: { id: true, username: true, password: true },
      });

      if (!user) throw new UnauthorizedException("Invalid credentials");

      const verification = await this.passwordService.verifyPassword(
        password,
        user.password,
      );

      if (!verification.isValid) {
        throw new UnauthorizedException("Invalid credentials");
      }

      if (verification.upgradedHash) {
        try {
          await this.prisma.user.update({
            where: { id: user.id },
            data: { password: verification.upgradedHash },
          });
        } catch {
          this.logger.warn(
            `Failed to upgrade legacy password hash for userId=${user.id}`,
          );
        }
      }

      const payload = { sub: user.id };

      return {
        access_token: await this.jwtService.signAsync(payload),
      };
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError) {
        throw new InternalServerErrorException("Login failed");
      }

      if (
        err instanceof UnauthorizedException ||
        err instanceof BadRequestException
      ) {
        throw err;
      }

      throw new InternalServerErrorException("Login failed");
    }
  }
}
