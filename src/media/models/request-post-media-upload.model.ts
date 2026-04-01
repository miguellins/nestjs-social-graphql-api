import { Field, GraphQLISODateTime, ID, ObjectType } from "@nestjs/graphql";

@ObjectType()
export class RequestPostMediaUpload {
  /** Identifier of the pending media record created for this upload. */
  @Field(() => ID)
  mediaId: number;

  /** Temporary presigned URL used by the client to upload directly to R2. */
  @Field()
  uploadUrl: string;

  /** Final public delivery URL expected for the uploaded media item. */
  @Field({
    name: "url",
  })
  publicUrl: string;

  /** Timestamp indicating when the presigned upload URL expires. */
  @Field(() => GraphQLISODateTime)
  expiresAt: Date;
}
