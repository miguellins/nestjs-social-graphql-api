import { Transform, type TransformFnParams } from "class-transformer";

/** Transforms a string to trimmed lowercase for DTO property normalization. */
export const Normalize = (): PropertyDecorator =>
  Transform(({ value }: TransformFnParams): unknown => {
    return typeof value === "string" ? value.trim().toLowerCase() : value;
  });
