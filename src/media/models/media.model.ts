import {
  Field,
  GraphQLISODateTime,
  ID,
  Int,
  ObjectType,
} from "@nestjs/graphql";

import { FormattedDateTimeField } from "@/graphql/fields/formatted-date-time-field.decorator";

import { MediaKind, MediaStatus, MediaType } from "@/media/models/media.enums";

/** Public media object exposed to owners and post detail consumers with safe delivery metadata. */
@ObjectType()
export class Media {
  /** Unique identifier of the media item. */
  @Field(() => ID)
  id: number;

  /** Product-level classification for the media item. */
  @Field(() => MediaKind)
  kind: MediaKind;

  /** Technical media type used for rendering decisions. */
  @Field(() => MediaType)
  type: MediaType;

  /** Upload lifecycle state for the media item. */
  @Field(() => MediaStatus)
  status: MediaStatus;

  /** MIME type verified for the stored object. */
  @Field()
  mimeType: string;

  /** Public delivery URL used by clients to render the media item. */
  @Field({
    name: "url",
  })
  publicUrl: string;

  /** Size of the stored object in bytes. */
  @Field(() => Int, {
    nullable: true,
  })
  bytes?: number | null;

  /** Image width in pixels when known. */
  @Field(() => Int, {
    nullable: true,
  })
  width?: number | null;

  /** Image height in pixels when known. */
  @Field(() => Int, {
    nullable: true,
  })
  height?: number | null;

  /** Video duration in milliseconds when known. */
  @Field(() => Int, {
    nullable: true,
  })
  durationMs?: number | null;

  /** Timestamp indicating when the media item was created. */
  @Field(() => GraphQLISODateTime)
  createdAt: Date;

  /** Presentation-friendly UTC timestamp for when the media item was created. */
  @FormattedDateTimeField("createdAt")
  createdAtFormatted?: string;

  /** Timestamp indicating when the media item was last updated. */
  @Field(() => GraphQLISODateTime)
  updatedAt: Date;

  /** Presentation-friendly UTC timestamp for when the media item was last updated. */
  @FormattedDateTimeField("updatedAt")
  updatedAtFormatted?: string;

  /** Timestamp indicating when the media item was attached to a post, if any. */
  @Field(() => GraphQLISODateTime, {
    nullable: true,
  })
  attachedAt?: Date | null;

  /** Presentation-friendly UTC timestamp for when the media item was attached to a post. */
  @FormattedDateTimeField("attachedAt", {
    nullable: true,
  })
  attachedAtFormatted?: string | null;
}
