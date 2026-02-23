import { PassportModule } from "@nestjs/passport";
import { JwtModule } from "@nestjs/jwt";
import { Module } from "@nestjs/common";

import { AuthResolver } from "@/auth/auth.resolver";
import { AuthService } from "@/auth/auth.service";

import { JwtStrategy } from "@/auth/jwt.strategy";

@Module({
  imports: [
    PassportModule,
    JwtModule.register({
      // Secret key used to sign and verify JWT tokens
      secret: process.env.JWT_SECRET,

      // JWT configuration options
      signOptions: { expiresIn: "7d" },
    }),
  ],
  providers: [AuthResolver, AuthService, JwtStrategy],
})
export class AuthModule {}
