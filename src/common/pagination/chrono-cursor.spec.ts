import { BadRequestException } from "@nestjs/common";

import {
  decodeChronoCursor,
  encodeChronoCursor,
} from "@/common/pagination/chrono-cursor";

describe("chrono-cursor", () => {
  it("encodes and decodes a valid chronological cursor", () => {
    const createdAt = new Date("2026-04-01T12:00:00.000Z");

    const encoded = encodeChronoCursor({
      createdAt,
      id: 123,
    });

    expect(decodeChronoCursor(encoded)).toEqual({
      createdAt,
      id: 123,
    });
  });

  it("throws BadRequestException for malformed base64 or json", () => {
    expect(() => decodeChronoCursor("%%%")).toThrow(BadRequestException);

    const invalidJson = Buffer.from("not-json", "utf8").toString("base64");

    expect(() => decodeChronoCursor(invalidJson)).toThrow(BadRequestException);
  });

  it("throws BadRequestException when required fields are missing", () => {
    const missingId = Buffer.from(
      JSON.stringify({ createdAt: "2026-04-01T12:00:00.000Z" }),
      "utf8",
    ).toString("base64");

    expect(() => decodeChronoCursor(missingId)).toThrow(BadRequestException);
  });

  it("throws BadRequestException for invalid dates or ids", () => {
    const invalidDate = Buffer.from(
      JSON.stringify({ createdAt: "nope", id: 1 }),
      "utf8",
    ).toString("base64");

    const invalidId = Buffer.from(
      JSON.stringify({ createdAt: "2026-04-01T12:00:00.000Z", id: 0 }),
      "utf8",
    ).toString("base64");

    expect(() => decodeChronoCursor(invalidDate)).toThrow(BadRequestException);
    expect(() => decodeChronoCursor(invalidId)).toThrow(BadRequestException);
  });
});
