import { ObjectType } from "@nestjs/graphql";

/**
 * GraphQL payload for authentication responses
 *
 * Returns the access token after a successful login
 */

@ObjectType()
export class AuthPayload {
  /** JWT access token returned after successful authentication. */
  access_token: string;
}
