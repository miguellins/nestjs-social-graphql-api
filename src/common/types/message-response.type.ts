import { ObjectType } from "@nestjs/graphql";

/**
 * GraphQL type for generic mutation results
 *
 * Returns a human-readable success message
 */

@ObjectType()
export class MessageResponse {
  /** Human-readable message describing the result of the mutation */
  message: string;
}
