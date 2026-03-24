import { formatDateTimeForDisplay } from "@/graphql/fields/formatted-date-time-field.decorator";

describe("formatDateTimeForDisplay", () => {
  it("formats Date instances as UTC presentation strings", () => {
    expect(formatDateTimeForDisplay(new Date("2026-03-21T14:24:12.398Z"))).toBe(
      "03/21/2026 02:24:12 PM",
    );
  });

  it("formats date-like strings as UTC presentation strings", () => {
    expect(formatDateTimeForDisplay("2026-03-21T14:24:12.398Z")).toBe(
      "03/21/2026 02:24:12 PM",
    );
  });

  it("formats SQL-like date strings as UTC presentation strings", () => {
    expect(formatDateTimeForDisplay("2026-03-21 14:24:12.398")).toBe(
      "03/21/2026 02:24:12 PM",
    );
  });

  it("formats trimmed SQL-like date strings as UTC presentation strings", () => {
    expect(formatDateTimeForDisplay(" 2026-03-21 14:24:12.398 ")).toBe(
      "03/21/2026 02:24:12 PM",
    );
  });

  it("formats numeric timestamps as UTC presentation strings", () => {
    expect(formatDateTimeForDisplay(1774103052398)).toBe(
      "03/21/2026 02:24:12 PM",
    );
  });

  it("returns null for nullish or invalid values", () => {
    expect(formatDateTimeForDisplay(null)).toBeNull();
    expect(formatDateTimeForDisplay(undefined)).toBeNull();
    expect(formatDateTimeForDisplay("not-a-date")).toBeNull();
  });
});
