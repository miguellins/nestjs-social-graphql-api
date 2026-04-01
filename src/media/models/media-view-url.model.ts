import { Field, GraphQLISODateTime, ID, ObjectType } from "@nestjs/graphql";

@ObjectType("SignedMediaViewUrl")
export class MediaViewUrl {
  /** Identifier of the media item the signed URL belongs to. */
  @Field(() => ID)
  mediaId: number;

  /** Temporary signed URL used to read the media object directly from R2. */
  @Field({
    name: "signedUrl",
  })
  url: string;

  /** Timestamp indicating when the signed read URL expires. */
  @Field(() => GraphQLISODateTime)
  expiresAt: Date;
}
