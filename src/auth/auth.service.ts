import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  UnauthorizedException,
} from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";

import { PrismaService } from "../prisma.service";

import { Prisma } from "@prisma/client";

import * as bcrypt from "bcrypt";

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
  ) {}

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

      if (!user) throw new UnauthorizedException("User not found");

      const isValid = await bcrypt.compare(password, user.password);
      if (!isValid) throw new UnauthorizedException("Invalid credentials");

      const payload = { sub: user.id };

      return {
        access_token: await this.jwtService.signAsync(payload),
      };
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError)
        throw new InternalServerErrorException("Login failed");

      if (
        err instanceof UnauthorizedException ||
        err instanceof BadRequestException
      )
        throw err;

      throw new InternalServerErrorException("Login failed");
    }
  }
}
