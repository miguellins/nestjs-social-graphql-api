import { registerEnumType } from "@nestjs/graphql";

/**
 * Shared GraphQL enum for controlling chronological list ordering
 *
 * Used by list queries that support switching between newest-first and
 * oldest-first results
 */

export enum ChronologicalOrder {
  NEWEST = "NEWEST",
  OLDEST = "OLDEST",
}

registerEnumType(ChronologicalOrder, {
  name: "ChronologicalOrder",
  description: "Controls chronological ordering for list queries",
});

export function toSortDirection(
  order: ChronologicalOrder | undefined,
): "asc" | "desc" {
  return order === ChronologicalOrder.OLDEST ? "asc" : "desc";
}
