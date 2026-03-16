import type { TransformFnParams } from "class-transformer";
import { Transform } from "class-transformer";

/**
 * Trims whitespace and converts string to lowercase
 * @example
 *
 * @Normalize()
 * @IsEmail()
 * email: string;
 */

export const Normalize = (): PropertyDecorator =>
  Transform(({ value }: TransformFnParams): unknown => {
    return typeof value === "string" ? value.trim().toLowerCase() : value;
  });
