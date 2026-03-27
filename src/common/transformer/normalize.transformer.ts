import { Transform, type TransformFnParams } from "class-transformer";

/**
 * Class-transformer decorator for normalized text
 *
 * Lowercases and trims string input values
 */

export const Normalize = (): PropertyDecorator =>
  Transform(({ value }: TransformFnParams): unknown => {
    return typeof value === "string" ? value.trim().toLowerCase() : value;
  });
