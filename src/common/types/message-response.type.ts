import { ObjectType } from "@nestjs/graphql";

/** Generic mutation response carrying a single human-readable status message. */
@ObjectType()
export class MessageResponse {
  /** Human-readable message describing the result of the mutation */
  message: string;
}
