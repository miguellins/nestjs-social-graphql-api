import { NotificationType } from "@prisma/client";

import { z } from "zod";

/** Validates the normalized input used to create a notification record. */
export const createNotificationInputSchema = z.object({
  recipientId: z.number().int().positive(),
  actorId: z.number().int().positive(),
  type: z.enum(NotificationType),
  title: z.string().trim().min(1).max(120),
  body: z.string().trim().min(1).max(300).optional(),
  entityId: z.number().int().positive().optional(),
});

export type CreateNotificationInput = z.infer<
  typeof createNotificationInputSchema
>;
