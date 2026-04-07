import { BadRequestException } from "@nestjs/common";

export type ChronoCursor = {
  createdAt: Date;
  id: number;
};

type DecodedChronoCursor = {
  createdAt?: unknown;
  id?: unknown;
};

/** Encodes a chronological cursor into an opaque base64 string tied to the current sort position. */
export function encodeChronoCursor(cursor: ChronoCursor): string {
  return Buffer.from(
    JSON.stringify({
      createdAt: cursor.createdAt.toISOString(),
      id: cursor.id,
    }),
    "utf8",
  ).toString("base64");
}

/** Decodes and validates a chronological cursor string. Callers should only reuse a cursor with the same filters and ordering that produced it. */
export function decodeChronoCursor(cursor: string): ChronoCursor {
  let parsed: DecodedChronoCursor;

  try {
    parsed = JSON.parse(
      Buffer.from(cursor, "base64").toString("utf8"),
    ) as DecodedChronoCursor;
  } catch {
    throw new BadRequestException("Invalid cursor");
  }

  const createdAt = parsed.createdAt;
  const id = parsed.id;

  if (
    typeof createdAt !== "string" ||
    typeof id !== "number" ||
    !Number.isInteger(id) ||
    id <= 0
  ) {
    throw new BadRequestException("Invalid cursor");
  }

  const date = new Date(createdAt);

  if (Number.isNaN(date.getTime())) {
    throw new BadRequestException("Invalid cursor");
  }

  return {
    createdAt: date,
    id,
  };
}
