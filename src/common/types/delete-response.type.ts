import { ObjectType } from "@nestjs/graphql";

/**
 * GraphQL type for delete results
 *
 * Returns the success state of delete operations
 */

@ObjectType()
export class DeleteResponse {
  /** Human-readable message describing the result of the mutation. */
  message: string;
}
