import { MediaKind, MediaType } from "@prisma/client";

import { z } from "zod";

/** Allowed image MIME types for v1 uploads. */
export const ALLOWED_IMAGE_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
] as const;

/** Allowed video MIME types for v1 uploads. */
export const ALLOWED_VIDEO_MIME_TYPES = ["video/mp4", "video/webm"] as const;

/** Narrow type for supported image MIME values. */
type AllowedImageMimeType = (typeof ALLOWED_IMAGE_MIME_TYPES)[number];

/** Narrow type for supported video MIME values. */
type AllowedVideoMimeType = (typeof ALLOWED_VIDEO_MIME_TYPES)[number];

/** Maximum allowed image upload size in bytes. */
export const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

/** Maximum allowed profile avatar upload size in bytes. */
export const MAX_PROFILE_AVATAR_BYTES = 2 * 1024 * 1024;

/** Minimum profile avatar image dimension in pixels. */
export const MIN_PROFILE_AVATAR_DIMENSION = 128;

/** Maximum profile avatar image dimension in pixels. */
export const MAX_PROFILE_AVATAR_DIMENSION = 4096;

/** Maximum allowed video upload size in bytes. */
export const MAX_VIDEO_BYTES = 100 * 1024 * 1024;

/** Checks whether a MIME type is an allowed image type. */
function isAllowedImageMimeType(
  mimeType: string,
): mimeType is AllowedImageMimeType {
  return ALLOWED_IMAGE_MIME_TYPES.includes(mimeType as AllowedImageMimeType);
}

/** Checks whether a MIME type is an allowed video type. */
function isAllowedVideoMimeType(
  mimeType: string,
): mimeType is AllowedVideoMimeType {
  return ALLOWED_VIDEO_MIME_TYPES.includes(mimeType as AllowedVideoMimeType);
}

/** Derives the media type from an allowed MIME type. */
function getMediaTypeForMimeType(mimeType: string): MediaType | undefined {
  if (isAllowedImageMimeType(mimeType)) return MediaType.IMAGE;
  if (isAllowedVideoMimeType(mimeType)) return MediaType.VIDEO;
  return undefined;
}

/** Maps a media type to the post media kind used in persistence. */
function getMediaKindForType(type: MediaType): MediaKind {
  return type === MediaType.IMAGE ? MediaKind.POST_IMAGE : MediaKind.POST_VIDEO;
}

/** Validates and normalizes a supported media MIME type. */
const mediaMimeTypeSchema = z
  .string()
  .trim()
  .toLowerCase()
  .superRefine((mimeType, ctx) => {
    if (!getMediaTypeForMimeType(mimeType)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Unsupported media MIME type",
      });
    }
  });

const positiveIntIdSchema = z.number().int().positive();

/** Validates and normalizes the request-upload command. */
export const requestPostMediaUploadCommandSchema = z
  .object({
    postId: positiveIntIdSchema,
    mimeType: mediaMimeTypeSchema,
    originalFileName: z
      .string()
      .trim()
      .min(1, "Original file name cannot be empty")
      .max(255)
      .optional(),
  })
  .transform((value) => {
    const type = getMediaTypeForMimeType(value.mimeType);

    return {
      ...value,
      type: type ?? MediaType.VIDEO,
      kind: getMediaKindForType(type ?? MediaType.VIDEO),
    } as const;
  });

/** Validates and normalizes the profile-avatar request-upload command. */
export const requestProfileAvatarUploadCommandSchema = z
  .object({
    mimeType: mediaMimeTypeSchema.refine(isAllowedImageMimeType, {
      message: "Profile avatars must be image uploads",
    }),
    originalFileName: z
      .string()
      .trim()
      .min(1, "Original file name cannot be empty")
      .max(255)
      .optional(),
  })
  .transform((value) => ({
    ...value,
    type: MediaType.IMAGE,
    kind: MediaKind.PROFILE_AVATAR,
  }));

/** Validates the complete-upload command. */
export const completePostMediaUploadCommandSchema = z.object({
  mediaId: positiveIntIdSchema,
});

/** Validates the complete-profile-avatar command. */
export const completeProfileAvatarUploadCommandSchema = z.object({
  mediaId: positiveIntIdSchema,
});

/** Validates the attach-media-to-post command. */
export const attachMediaToPostCommandSchema = z.object({
  postId: positiveIntIdSchema,
  mediaId: positiveIntIdSchema,
});

/** Inferred type for request-upload commands. */
export type RequestPostMediaUploadCommand = z.infer<
  typeof requestPostMediaUploadCommandSchema
>;

/** Raw request-upload input type before schema normalization adds kind and type. */
export type RequestPostMediaUploadInputCommand = z.input<
  typeof requestPostMediaUploadCommandSchema
>;

/** Inferred type for profile-avatar request-upload commands. */
export type RequestProfileAvatarUploadCommand = z.infer<
  typeof requestProfileAvatarUploadCommandSchema
>;

/** Raw profile-avatar request input before schema normalization adds kind and type. */
export type RequestProfileAvatarUploadInputCommand = z.input<
  typeof requestProfileAvatarUploadCommandSchema
>;

/** Inferred type for complete-upload commands. */
export type CompletePostMediaUploadCommand = z.infer<
  typeof completePostMediaUploadCommandSchema
>;

/** Inferred type for complete-profile-avatar commands. */
export type CompleteProfileAvatarUploadCommand = z.infer<
  typeof completeProfileAvatarUploadCommandSchema
>;

/** Inferred type for attach-media-to-post commands. */
export type AttachMediaToPostCommand = z.infer<
  typeof attachMediaToPostCommandSchema
>;
