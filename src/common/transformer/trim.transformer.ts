import { Transform, type TransformFnParams } from "class-transformer";

/** Transforms a string to its trimmed version for DTO property normalization. */
export const Trim = (): PropertyDecorator =>
  Transform(({ value }: TransformFnParams): unknown =>
    typeof value === "string" ? value.trim() : value,
  );
