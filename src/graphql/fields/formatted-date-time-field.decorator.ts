import { applyDecorators } from "@nestjs/common";
import {
  Field,
  type FieldMiddleware,
  type MiddlewareContext,
} from "@nestjs/graphql";

/** Configures the generated formatted date-time GraphQL field. */
type FormattedDateTimeFieldOptions = {
  description?: string;
  nullable?: boolean;
};

/** Represents the accepted raw values that can be parsed as dates. */
type DateLikeValue = Date | number | string | null | undefined;

/** Stores the extracted UTC date-time parts used for display formatting. */
type FormattedDateTimeParts = {
  day: string;
  dayPeriod: string;
  hour: string;
  minute: string;
  month: string;
  second: string;
  year: string;
};

/** Tracks the non-literal formatter part names required for display output. */
const FORMATTED_DATE_TIME_PART_TYPES = new Set<keyof FormattedDateTimeParts>([
  "day",
  "dayPeriod",
  "hour",
  "minute",
  "month",
  "second",
  "year",
]);

/** Formats UTC dates into stable display parts using the en-US locale. */
const formattedDateTimeFormatter = new Intl.DateTimeFormat("en-US", {
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hour12: true,
  timeZone: "UTC",
});

/** Matches SQL-style UTC timestamps that need ISO normalization. */
const UTC_DATE_TIME_WITH_SPACE_SEPARATOR =
  /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}(?:\.\d{1,3})?$/;

/** Preserves ISO inputs and upgrades SQL-style UTC timestamps to ISO form. */
function normalizeDateTimeString(value: string): string {
  const normalizedValue = value.trim();

  if (UTC_DATE_TIME_WITH_SPACE_SEPARATOR.test(normalizedValue)) {
    return `${normalizedValue.replace(" ", "T")}Z`;
  }

  return normalizedValue;
}

/** Parses supported date-like values into valid native `Date` instances. */
function parseDateLikeValue(value: DateLikeValue): Date | null {
  if (value == null) {
    return null;
  }

  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }

  if (typeof value === "string" || typeof value === "number") {
    const parsedValue = new Date(
      typeof value === "string" ? normalizeDateTimeString(value) : value,
    );

    return Number.isNaN(parsedValue.getTime()) ? null : parsedValue;
  }

  return null;
}

/** Extracts normalized date-time parts without relying on locale punctuation. */
function extractFormattedDateTimeParts(value: Date): FormattedDateTimeParts {
  const parts: Partial<FormattedDateTimeParts> = {};

  for (const part of formattedDateTimeFormatter.formatToParts(value)) {
    if (part.type === "literal") {
      continue;
    }

    if (
      FORMATTED_DATE_TIME_PART_TYPES.has(
        part.type as keyof FormattedDateTimeParts,
      )
    ) {
      parts[part.type as keyof FormattedDateTimeParts] = part.value;
    }
  }

  return parts as FormattedDateTimeParts;
}

/** Formats a date-like value as `MM/DD/YYYY hh:mm:ss AM/PM` in UTC. */
export function formatDateTimeForDisplay(value: DateLikeValue): string | null {
  const parsedValue = parseDateLikeValue(value);

  if (!parsedValue) {
    return null;
  }

  const parts = extractFormattedDateTimeParts(parsedValue);

  return `${parts.month}/${parts.day}/${parts.year} ${parts.hour}:${parts.minute}:${parts.second} ${parts.dayPeriod}`;
}

/** Builds field middleware that formats the value from a sibling source field. */
function formattedDateTimeFieldMiddleware(
  sourceField: string,
): FieldMiddleware {
  return ({ source }: MiddlewareContext) =>
    formatDateTimeForDisplay(
      (source as Record<string, DateLikeValue> | undefined)?.[sourceField],
    );
}

/** Declares a formatted companion GraphQL field derived from another field. */
export function FormattedDateTimeField(
  sourceField: string,
  options: FormattedDateTimeFieldOptions = {},
) {
  const { description, nullable } = options;

  return applyDecorators(
    Field(() => String, {
      nullable,
      description,
      middleware: [formattedDateTimeFieldMiddleware(sourceField)],
    }),
  );
}
