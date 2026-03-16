import type { TransformFnParams } from "class-transformer";
import { Transform } from "class-transformer";

/**
 * Trims whitespace from string values
 * @example
 *
 * @Trim()
 * @IsString()
 * name: string;
 */

export const Trim = (): PropertyDecorator =>
  Transform(({ value }: TransformFnParams): unknown =>
    typeof value === "string" ? value.trim() : value,
  );
