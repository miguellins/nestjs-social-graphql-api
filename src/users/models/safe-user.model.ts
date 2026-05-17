import { Field, GraphQLISODateTime, ObjectType } from "@nestjs/graphql";

import { FormattedDateTimeField } from "@/graphql/fields/formatted-date-time-field.decorator";
import { normalizeOutputTextMiddleware } from "@/graphql/middleware/normalize-output-text.middleware";

import { PublicUserIdentity } from "@/users/models/public-user-identity.interface";
import { UserPrivacySetting } from "@/users/enums/user-privacy-setting.enum";
import { UserCounts } from "@/users/models/user-counts.model";

/** Public user representation with non-sensitive fields */
@ObjectType({ implements: () => PublicUserIdentity })
export class SafeUser extends PublicUserIdentity {
  /** Account-wide privacy mode for this user. */
  @Field(() => UserPrivacySetting)
  privacySetting: UserPrivacySetting;

  /** Whether the user has verified ownership of their email address. */
  @Field()
  isEmailVerified: boolean;

  /** Plain-text public biography shown on profile detail reads. */
  @Field({
    nullable: true,
    middleware: [normalizeOutputTextMiddleware],
  })
  bio?: string | null;

  /** Optional public website URL supplied by the user. */
  @Field({
    nullable: true,
  })
  websiteUrl?: string | null;

  /** Optional short free-text location shown on public profiles. */
  @Field({
    nullable: true,
  })
  location?: string | null;

  /** Public delivery URL for the READY profile avatar, when available. */
  @Field({
    nullable: true,
  })
  avatarUrl?: string | null;

  /** When the user account was created */
  @Field(() => GraphQLISODateTime)
  createdAt: Date;

  /** Presentation-friendly UTC timestamp for when the user account was created. */
  @FormattedDateTimeField("createdAt")
  createdAtFormatted?: string;

  /** When the user was last updated */
  @Field(() => GraphQLISODateTime)
  updatedAt: Date;

  /** Presentation-friendly UTC timestamp for when the user was last updated. */
  @FormattedDateTimeField("updatedAt")
  updatedAtFormatted?: string;

  /** Related entity counts when explicitly requested */
  @Field(() => UserCounts, {
    nullable: true,
  })
  _count?: UserCounts;
}
