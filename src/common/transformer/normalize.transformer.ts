import { Transform } from "class-transformer";

/**
 * Trims whitespace and converts string to lowercase
 * @example
 *
 * @Normalize()
 * @IsEmail()
 * email: string;
 */

export const Normalize = () =>
  Transform(({ value }) =>
    typeof value === "string" ? value.trim().toLowerCase() : value,
  );
