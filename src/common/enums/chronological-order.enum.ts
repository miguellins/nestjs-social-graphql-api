import { registerEnumType } from "@nestjs/graphql";

/** Converts a ChronologicalOrder to a Prisma-compatible sort direction. */
export enum ChronologicalOrder {
  NEWEST = "NEWEST",
  OLDEST = "OLDEST",
}

registerEnumType(ChronologicalOrder, {
  name: "ChronologicalOrder",
  description: "Controls chronological ordering for list queries",
});

/** Converts a ChronologicalOrder to a Prisma-compatible sort direction. */
export function toSortDirection(
  order: ChronologicalOrder | undefined,
): "asc" | "desc" {
  return order === ChronologicalOrder.OLDEST ? "asc" : "desc";
}
