import { Transform } from "class-transformer";

/**
 * Trims whitespace from string values
 * @example
 *
 * @Trim()
 * @IsString()
 * name: string;
 */

export const Trim = () =>
  Transform(({ value }) => (typeof value === "string" ? value.trim() : value));
