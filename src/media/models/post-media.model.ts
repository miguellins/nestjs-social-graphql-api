import {
  Field,
  GraphQLISODateTime,
  ID,
  Int,
  ObjectType,
} from "@nestjs/graphql";

import { FormattedDateTimeField } from "@/graphql/fields/formatted-date-time-field.decorator";

import { Media } from "@/media/models/media.model";

@ObjectType()
export class PostMedia {
  /** Unique identifier of the post-media attachment relation. */
  @Field(() => ID)
  id: number;

  /** Zero-based or sequential ordering value for attachments on a post. */
  @Field(() => Int)
  sortOrder: number;

  /** Media payload attached to the post. */
  @Field(() => Media)
  media: Media;

  /** Timestamp indicating when the media item was attached to the post. */
  @Field(() => GraphQLISODateTime)
  createdAt: Date;

  @FormattedDateTimeField("createdAt", {
    description:
      "Presentation-friendly UTC timestamp for when the media item was attached to the post.",
  })
  createdAtFormatted?: string;
}
