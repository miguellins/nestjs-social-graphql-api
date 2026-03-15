import { PassportStrategy } from "@nestjs/passport";
import { ConfigService } from "@nestjs/config";
import { Injectable } from "@nestjs/common";

import {
  ExtractJwt,
  Strategy,
  type JwtFromRequestFunction,
} from "passport-jwt";

/**
 * Authenticates protected requests with bearer JWT tokens
 */

type JwtPayload = { sub: number };

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, "jwt") {
  // Configures the passport JWT strategy with the application secret
  constructor(configService: ConfigService) {
    const secret = configService.get<string>("JWT_SECRET");

    if (!secret) throw new Error("JWT_SECRET is not set");

    const jwtFromRequest: JwtFromRequestFunction =
      ExtractJwt.fromAuthHeaderAsBearerToken();

    super({
      jwtFromRequest,
      secretOrKey: secret,
      ignoreExpiration: false,
    });
  }

  // Maps the JWT payload into the request user shape
  validate(payload: JwtPayload) {
    return { id: payload.sub };
  }
}
