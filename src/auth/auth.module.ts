import { PassportModule } from "@nestjs/passport";
import { Module } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";

import { AuthResolver } from "./auth.resolver";
import { AuthService } from "./auth.service";

import { jwtConstants } from "./jwt.constants";
import { JwtStrategy } from "./jwt.strategy";

@Module({
  imports: [
    PassportModule,
    JwtModule.register({
      // Secret key used to sign and verify JWT tokens
      secret: jwtConstants.secret,

      // JWT configuration options
      signOptions: { expiresIn: "7d" },
    }),
  ],
  providers: [AuthResolver, AuthService, JwtStrategy],
})
export class AuthModule { }
