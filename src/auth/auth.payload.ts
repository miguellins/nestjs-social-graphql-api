import { ObjectType } from "@nestjs/graphql";

@ObjectType()
export class AuthPayload {
  /** JWT access token returned after successful authentication. */
  access_token: string;
}
