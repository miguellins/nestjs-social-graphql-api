import { z } from "zod";

/** Validates partial preference updates while rejecting empty patches. */
export const updateNotificationPreferencesCommandSchema = z
  .object({
    replyNotificationsEnabled: z.boolean().optional(),
    followRequestNotificationsEnabled: z.boolean().optional(),
    mentionNotificationsEnabled: z.boolean().optional(),
    postLikedNotificationsEnabled: z.boolean().optional(),
    postRepostedNotificationsEnabled: z.boolean().optional(),
    postQuotedNotificationsEnabled: z.boolean().optional(),
    userFollowedNotificationsEnabled: z.boolean().optional(),
  })
  .strict()
  .refine(
    (value) => Object.values(value).some((field) => field !== undefined),
    "At least one notification preference must be provided",
  );

export type UpdateNotificationPreferencesCommand = z.infer<
  typeof updateNotificationPreferencesCommandSchema
>;
