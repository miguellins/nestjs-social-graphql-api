import { MediaKind, MediaType } from "@prisma/client";

import {
  attachMediaToPostCommandSchema,
  completePostMediaUploadCommandSchema,
  requestPostMediaUploadCommandSchema,
} from "@/media/schemas/media-write.schema";

describe("media-write.schema", () => {
  describe("requestPostMediaUploadCommandSchema", () => {
    it("normalizes a valid image upload request", () => {
      const result = requestPostMediaUploadCommandSchema.parse({
        postId: 10,
        mimeType: " IMAGE/JPEG ",
        originalFileName: " photo.jpg ",
      });

      expect(result).toEqual({
        postId: 10,
        mimeType: "image/jpeg",
        originalFileName: "photo.jpg",
        type: MediaType.IMAGE,
        kind: MediaKind.POST_IMAGE,
      });
    });

    it("normalizes a valid video upload request", () => {
      const result = requestPostMediaUploadCommandSchema.parse({
        postId: 10,
        mimeType: "video/webm",
      });

      expect(result).toEqual({
        postId: 10,
        mimeType: "video/webm",
        type: MediaType.VIDEO,
        kind: MediaKind.POST_VIDEO,
      });
    });

    it("rejects unsupported MIME types", () => {
      expect(() =>
        requestPostMediaUploadCommandSchema.parse({
          postId: 10,
          mimeType: "application/pdf",
        }),
      ).toThrow("Unsupported media MIME type");
    });

    it("rejects non-positive ids", () => {
      expect(() =>
        requestPostMediaUploadCommandSchema.parse({
          postId: 0,
          mimeType: "image/png",
        }),
      ).toThrow();
    });
  });

  describe("completePostMediaUploadCommandSchema", () => {
    it("accepts a positive media id", () => {
      expect(
        completePostMediaUploadCommandSchema.parse({ mediaId: 33 }),
      ).toEqual({ mediaId: 33 });
    });

    it("rejects a non-positive media id", () => {
      expect(() =>
        completePostMediaUploadCommandSchema.parse({ mediaId: 0 }),
      ).toThrow();
    });
  });

  describe("attachMediaToPostCommandSchema", () => {
    it("accepts positive post and media ids", () => {
      expect(
        attachMediaToPostCommandSchema.parse({ postId: 10, mediaId: 33 }),
      ).toEqual({ postId: 10, mediaId: 33 });
    });

    it("rejects non-positive post or media ids", () => {
      expect(() =>
        attachMediaToPostCommandSchema.parse({ postId: -1, mediaId: 33 }),
      ).toThrow();

      expect(() =>
        attachMediaToPostCommandSchema.parse({ postId: 10, mediaId: 0 }),
      ).toThrow();
    });
  });
});
