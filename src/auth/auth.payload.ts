import { ObjectType } from "@nestjs/graphql";

/** Authentication payload returned after successful login and token issuance. */
@ObjectType()
export class AuthPayload {
  /** JWT access token returned after successful authentication. */
  access_token: string;

  /** Opaque refresh token used to rotate the auth session. */
  refreshToken: string;
}
