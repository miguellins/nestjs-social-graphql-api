import { ObjectType } from "@nestjs/graphql";

@ObjectType()
export class DeleteResponse {
  /** Human-readable message describing the result of the mutation. */
  message: string;
}
