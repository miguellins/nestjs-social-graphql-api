import { PassportStrategy } from "@nestjs/passport";
import { Injectable } from "@nestjs/common";

import {
  ExtractJwt,
  Strategy,
  type JwtFromRequestFunction,
} from "passport-jwt";

/**
 * Passport JWT strategy used to authenticate protected requests.
 *
 * Extracts the bearer token from the Authorization header, validates it with
 * the configured JWT secret, and maps the token payload into the authenticated
 * request user shape consumed by guards and resolvers.
 */

type JwtPayload = { sub: number };

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, "jwt") {
  constructor() {
    const secret = process.env.JWT_SECRET;
    if (!secret) throw new Error("JWT_SECRET is not set");

    const jwtFromRequest: JwtFromRequestFunction =
      ExtractJwt.fromAuthHeaderAsBearerToken();

    super({
      jwtFromRequest,
      secretOrKey: secret,
      ignoreExpiration: false,
    });
  }

  validate(payload: JwtPayload) {
    return { id: payload.sub };
  }
}
