import { BadRequestException } from "@nestjs/common";

import { ZodError, type ZodType } from "zod";

/** Parses input with a Zod schema and throws BadRequestException on validation errors. */
export function parseWithBadRequest<TInput, TOutput>(
  schema: ZodType<TOutput, TInput>,
  input: TInput,
  fallbackMessage: string,
): TOutput {
  try {
    return schema.parse(input);
  } catch (error) {
    if (error instanceof ZodError) {
      throw new BadRequestException(
        error.issues[0]?.message ?? fallbackMessage,
      );
    }

    throw error;
  }
}
