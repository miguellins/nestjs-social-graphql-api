import { Field, ObjectType } from "@nestjs/graphql";

import { MutedUserPage } from "@/mutes/models/muted-user-page.model";
import { NotificationPreferences } from "@/notifications/models/notification-preferences.model";
import { SilencedActorPage } from "@/notifications/models/silenced-actor-page.model";

/** Unified current-user interaction preference snapshot. */
@ObjectType()
export class UserInteractionPreferences {
  /** Global notification category preferences. */
  @Field(() => NotificationPreferences)
  notificationPreferences!: NotificationPreferences;

  /** Current page of muted user relationships. */
  @Field(() => MutedUserPage)
  mutedUsers!: MutedUserPage;

  /** Current page of notification-silenced actors. */
  @Field(() => SilencedActorPage)
  silencedActors!: SilencedActorPage;
}
