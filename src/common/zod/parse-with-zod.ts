import { BadRequestException } from "@nestjs/common";

import { ZodError, type ZodType } from "zod";

/**
 * Wraps Zod parsing and converts validation errors into BadRequestException
 */

// Parses input with Zod and throws a Nest bad-request error on validation failure
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
