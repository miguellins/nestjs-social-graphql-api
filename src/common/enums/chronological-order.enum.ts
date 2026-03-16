import { registerEnumType } from "@nestjs/graphql";

/**
 * Shared enum for chronological sorting
 *
 * Defines list order options and maps them to Prisma sort directions
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
