import { Injectable, UnauthorizedException } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";

import { PrismaService } from "../prisma.service";

import * as bcrypt from "bcrypt";

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
  ) {}

  async login(input: { username: string; password: string }) {
    const user = await this.prisma.user.findUnique({
      where: { username: input.username },
    });

    if (!user) throw new UnauthorizedException("User not found");

    const comparePasswords = await bcrypt.compare(
      input.password,
      user.password,
    );

    if (!comparePasswords)
      throw new UnauthorizedException("Password is incorrect");

    const payload = { sub: user.id };

    return {
      access_token: await this.jwtService.signAsync(payload),
    };
  }
}
