import { PassportModule } from "@nestjs/passport";
import { ConfigService } from "@nestjs/config";
import { Module } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";

import { EmailVerificationDeliveryService } from "@/auth/email-verification-delivery.service";
import { PasswordResetDeliveryService } from "@/auth/password-reset-delivery.service";
import { AuthResolver } from "@/auth/auth.resolver";
import { AuthService } from "@/auth/auth.service";
import { JwtStrategy } from "@/auth/jwt.strategy";

import { PasswordModule } from "@/common/security/password.module";

import type { StringValue } from "ms";

@Module({
  imports: [
    PassportModule,
    PasswordModule,
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const secret = config.get<string>("JWT_SECRET");
        const expiresIn = config.get<string>("JWT_EXPIRES_IN");

        if (!secret) throw new Error("JWT_SECRET is not defined");
        if (!expiresIn) throw new Error("JWT_EXPIRES_IN is not defined");

        return {
          secret,
          signOptions: {
            expiresIn: expiresIn as StringValue,
          },
        };
      },
    }),
  ],
  providers: [
    AuthService,
    AuthResolver,
    JwtStrategy,
    EmailVerificationDeliveryService,
    PasswordResetDeliveryService,
  ],
  exports: [AuthService, JwtModule],
})
export class AuthModule {}
