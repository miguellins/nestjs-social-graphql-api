import { registerEnumType } from "@nestjs/graphql";

import { MediaKind, MediaStatus, MediaType } from "@prisma/client";

registerEnumType(MediaKind, {
  name: "MediaKind",
  description: "Classifies the product-level purpose of a media item",
});

registerEnumType(MediaType, {
  name: "MediaType",
  description: "Classifies whether a media item is an image or a video",
});

registerEnumType(MediaStatus, {
  name: "MediaStatus",
  description: "Tracks the upload and verification lifecycle of a media item",
});

/** Re-exports the GraphQL-registered media enums used by the media module. */
export { MediaKind, MediaStatus, MediaType };
