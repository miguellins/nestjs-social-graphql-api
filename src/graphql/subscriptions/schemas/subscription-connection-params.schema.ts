import { z } from "zod";

/**
 * Parses websocket connection params and extracts the bearer token
 */

export const subscriptionConnectionParamsSchema = z
  .object({
    authorization: z.unknown().optional(),
    Authorization: z.unknown().optional(),
  })
  .transform((value) => value.authorization ?? value.Authorization)
  .refine((value): value is string => typeof value === "string", {
    message: "Missing authorization in websocket connection params",
  })
  .transform((value) => value.trim())
  .refine((value) => value.startsWith("Bearer "), {
    message: "Authorization must be in format: Bearer <token>",
  })
  .transform((value) => value.slice(7))
  .refine((value) => value.length > 0, {
    message: "Authorization token cannot be empty",
  });
