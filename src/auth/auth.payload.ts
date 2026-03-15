import { ObjectType } from "@nestjs/graphql";

/**
 * GraphQL object returned by authentication operations
 *
 * Exposes the signed JWT access token that clients use to authenticate
 * subsequent protected requests
 */

@ObjectType()
export class AuthPayload {
  /** JWT access token returned after successful authentication. */
  access_token: string;
}
