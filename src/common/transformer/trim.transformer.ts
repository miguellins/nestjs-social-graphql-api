import type { TransformFnParams } from "class-transformer";
import { Transform } from "class-transformer";

/**
 * Class-transformer decorator for trimmed text
 *
 * Removes extra whitespace from string input values
 */

export const Trim = (): PropertyDecorator =>
  Transform(({ value }: TransformFnParams): unknown =>
    typeof value === "string" ? value.trim() : value,
  );
