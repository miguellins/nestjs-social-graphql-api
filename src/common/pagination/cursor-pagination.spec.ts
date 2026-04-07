import { ChronologicalOrder } from "@/common/enums/chronological-order.enum";
import { PAGINATION } from "@/common/constants/hard-cap.constants";
import { decodeChronoCursor } from "@/common/pagination/chrono-cursor";
import {
  buildChronologicalCursorFilter,
  buildCursorPage,
  normalizeCursorTake,
} from "@/common/pagination/cursor-pagination";

describe("cursor-pagination", () => {
  describe("normalizeCursorTake", () => {
    it("defaults to PAGINATION.DEFAULT_TAKE", () => {
      expect(normalizeCursorTake(undefined)).toBe(PAGINATION.DEFAULT_TAKE);
    });

    it("caps values at PAGINATION.MAX_TAKE", () => {
      expect(normalizeCursorTake(PAGINATION.MAX_TAKE + 99)).toBe(
        PAGINATION.MAX_TAKE,
      );
    });

    it("preserves valid explicit values", () => {
      expect(normalizeCursorTake(7)).toBe(7);
    });

    it("clamps zero and negative values up to the minimum page size", () => {
      expect(normalizeCursorTake(0)).toBe(1);
      expect(normalizeCursorTake(-10)).toBe(1);
    });

    it("truncates non-integer values before applying bounds", () => {
      expect(normalizeCursorTake(7.9)).toBe(7);
      expect(normalizeCursorTake(0.4)).toBe(1);
    });
  });

  describe("buildChronologicalCursorFilter", () => {
    const cursor = {
      createdAt: new Date("2026-04-01T12:00:00.000Z"),
      id: 123,
    };

    it("returns undefined when no cursor is provided", () => {
      expect(
        buildChronologicalCursorFilter(undefined, ChronologicalOrder.NEWEST),
      ).toBeUndefined();
    });

    it("builds the NEWEST cursor filter", () => {
      expect(
        buildChronologicalCursorFilter(cursor, ChronologicalOrder.NEWEST),
      ).toEqual({
        OR: [
          { createdAt: { lt: cursor.createdAt } },
          { createdAt: cursor.createdAt, id: { lt: cursor.id } },
        ],
      });
    });

    it("builds the OLDEST cursor filter", () => {
      expect(
        buildChronologicalCursorFilter(cursor, ChronologicalOrder.OLDEST),
      ).toEqual({
        OR: [
          { createdAt: { gt: cursor.createdAt } },
          { createdAt: cursor.createdAt, id: { gt: cursor.id } },
        ],
      });
    });
  });

  describe("buildCursorPage", () => {
    const rows = [
      { id: 3, createdAt: new Date("2026-04-03T00:00:00.000Z"), value: "a" },
      { id: 2, createdAt: new Date("2026-04-02T00:00:00.000Z"), value: "b" },
      { id: 1, createdAt: new Date("2026-04-01T00:00:00.000Z"), value: "c" },
    ];

    it("trims the overflow row and reports hasNextPage", () => {
      const result = buildCursorPage(rows, 2);
      const secondRow = rows[1];

      expect(result.items).toEqual(rows.slice(0, 2));
      expect(result.pageInfo.hasNextPage).toBe(true);
      expect(secondRow).toBeDefined();
      expect(decodeChronoCursor(result.pageInfo.endCursor!)).toEqual({
        createdAt: secondRow!.createdAt,
        id: secondRow!.id,
      });
    });

    it("returns null endCursor for an empty page", () => {
      const result = buildCursorPage([], 2);

      expect(result.items).toEqual([]);
      expect(result.pageInfo).toEqual({
        endCursor: null,
        hasNextPage: false,
      });
    });

    it("keeps all rows when there is no overflow row", () => {
      const result = buildCursorPage(rows.slice(0, 2), 2);

      expect(result.items).toEqual(rows.slice(0, 2));
      expect(result.pageInfo.hasNextPage).toBe(false);
      expect(result.pageInfo.endCursor).not.toBeNull();
    });
  });
});
