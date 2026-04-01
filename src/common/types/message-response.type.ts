import { ObjectType } from "@nestjs/graphql";

@ObjectType()
export class MessageResponse {
  /** Human-readable message describing the result of the mutation */
  message: string;
}
