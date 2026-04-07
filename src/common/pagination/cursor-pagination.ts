import { ChronologicalOrder } from "@/common/enums/chronological-order.enum";
import { PAGINATION } from "@/common/constants/hard-cap.constants";
import {
  type ChronoCursor,
  encodeChronoCursor,
} from "@/common/pagination/chrono-cursor";

type CursorComparableRow = {
  createdAt: Date;
  id: number;
};

type ChronologicalCursorFilter = {
  OR: [
    {
      createdAt: {
        lt?: Date;
        gt?: Date;
      };
    },
    {
      createdAt: Date;
      id: {
        lt?: number;
        gt?: number;
      };
    },
  ];
};

export type CursorPageResult<T> = {
  items: T[];
  pageInfo: {
    endCursor: string | null;
    hasNextPage: boolean;
  };
};

/** Clamps a requested cursor-page size to the repository pagination limits. */
export function normalizeCursorTake(first?: number): number {
  const normalizedFirst =
    typeof first === "number" && Number.isFinite(first)
      ? Math.trunc(first)
      : PAGINATION.DEFAULT_TAKE;

  return Math.min(Math.max(normalizedFirst, 1), PAGINATION.MAX_TAKE);
}

/** Builds the cursor filter for deterministic chronological pagination. */
export function buildChronologicalCursorFilter(
  cursor: ChronoCursor | undefined,
  order: ChronologicalOrder | undefined,
): ChronologicalCursorFilter | undefined {
  if (!cursor) return undefined;

  if (order === ChronologicalOrder.OLDEST) {
    return {
      OR: [
        { createdAt: { gt: cursor.createdAt } },
        { createdAt: cursor.createdAt, id: { gt: cursor.id } },
      ],
    };
  }

  return {
    OR: [
      { createdAt: { lt: cursor.createdAt } },
      { createdAt: cursor.createdAt, id: { lt: cursor.id } },
    ],
  };
}

/** Converts a fetched `limit + 1` result set into items plus cursor page metadata. */
export function buildCursorPage<T extends CursorComparableRow>(
  rows: T[],
  limit: number,
): CursorPageResult<T> {
  const hasNextPage = rows.length > limit;
  const items = hasNextPage ? rows.slice(0, limit) : rows;
  const lastItem = items.at(-1);

  return {
    items,
    pageInfo: {
      endCursor: lastItem
        ? encodeChronoCursor({
            createdAt: lastItem.createdAt,
            id: lastItem.id,
          })
        : null,
      hasNextPage,
    },
  };
}
