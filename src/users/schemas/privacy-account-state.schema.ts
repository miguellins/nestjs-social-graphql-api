import { z } from "zod";

import { UserPrivacySetting } from "@/users/enums/user-privacy-setting.enum";

/** Validates privacy-setting updates for the current user. */
export const updateMyPrivacySettingCommandSchema = z.object({
  privacySetting: z.nativeEnum(UserPrivacySetting),
});

/** Validates moderation-driven suspension commands. */
export const suspendUserCommandSchema = z.object({
  userId: z.number().int().positive(),
  reason: z.string().trim().min(1, "Reason cannot be empty").max(500),
});

/** Validates moderation-driven reactivation commands. */
export const reactivateUserCommandSchema = z.object({
  userId: z.number().int().positive(),
  reason: z.string().trim().min(1, "Reason cannot be empty").max(500),
});

export type UpdateMyPrivacySettingCommand = z.infer<
  typeof updateMyPrivacySettingCommandSchema
>;
export type SuspendUserCommand = z.infer<typeof suspendUserCommandSchema>;
export type ReactivateUserCommand = z.infer<typeof reactivateUserCommandSchema>;
