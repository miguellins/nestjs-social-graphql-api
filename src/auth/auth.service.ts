import { Injectable, UnauthorizedException } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import * as bcrypt from "bcrypt";
import { PrismaService } from "../prisma.service";

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
  ) {}

  async login(input: { username: string; password: string }) {
    const user = await this.prisma.user.findUnique({
      where: { username: input.username },
      select: { id: true, username: true, password: true },
    });

    if (!user) {
      throw new UnauthorizedException("Invalid credentials");
    }

    const ok = await bcrypt.compare(input.password, user.password);
    if (!ok) {
      throw new UnauthorizedException("Invalid credentials");
    }

    // ✅ best practice: keep payload minimal
    const payload = { sub: user.id };

    return {
      access_token: await this.jwtService.signAsync(payload),
    };
  }
}
