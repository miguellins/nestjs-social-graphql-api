import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
} from "@nestjs/common";

import { R2StorageService } from "@/media/storage/r2-storage.service";

import type { MediaType } from "@prisma/client";

import { randomUUID } from "crypto";

import sharp from "sharp";

@Injectable()
export class MediaValidationService {
  constructor(private readonly r2Storage: R2StorageService) {}

  // Builds a deterministic per-post object-key prefix
  getPostObjectKeyPrefix(postId: number): string {
    return `posts/${postId}/media/`;
  }

  // Builds the final R2 object key for one pending media item
  buildObjectKey(postId: number, mimeType: string): string {
    return `${this.getPostObjectKeyPrefix(postId)}${randomUUID()}/original.${this.getFileExtensionForMimeType(mimeType)}`;
  }

  // Extracts the intended post id from a media object key
  getPostIdFromObjectKey(objectKey: string): number {
    const match = /^posts\/(\d+)\/media\//.exec(objectKey);

    if (!match) {
      throw new InternalServerErrorException("Media object key is invalid");
    }

    return Number(match[1]);
  }

  // Normalizes provider MIME types for safe equality checks
  normalizeMimeType(mimeType: string | null): string | null {
    if (!mimeType) {
      return null;
    }

    return mimeType.split(";")[0]?.trim().toLowerCase() ?? null;
  }

  // Inspects the uploaded object using the validation strategy for its media type
  async inspectMediaObject(
    objectKey: string,
    type: MediaType,
    mimeType: string,
  ): Promise<{
    width?: number;
    height?: number;
    durationMs?: number | null;
  }> {
    if (type === "IMAGE") {
      return this.inspectImageObject(objectKey, mimeType);
    }

    return this.inspectVideoObject(objectKey, mimeType);
  }

  // Private Helpers
  // Maps a supported MIME type to the stored object file extension
  private getFileExtensionForMimeType(mimeType: string): string {
    switch (mimeType) {
      case "image/jpeg":
        return "jpg";
      case "image/png":
        return "png";
      case "image/webp":
        return "webp";
      case "video/mp4":
        return "mp4";
      case "video/webm":
        return "webm";
      default:
        throw new BadRequestException("Unsupported media MIME type");
    }
  }

  // Maps a supported image MIME type to the decoded Sharp format name
  private getSharpFormatForMimeType(
    mimeType: string,
  ): sharp.Metadata["format"] | null {
    switch (mimeType) {
      case "image/jpeg":
        return "jpeg";
      case "image/png":
        return "png";
      case "image/webp":
        return "webp";
      default:
        return null;
    }
  }

  // Inspects an uploaded image object and extracts safe metadata
  private async inspectImageObject(
    objectKey: string,
    mimeType: string,
  ): Promise<{ width: number; height: number }> {
    const buffer = await this.r2Storage.getObjectBuffer(objectKey);

    let metadata: sharp.Metadata;

    try {
      metadata = await sharp(buffer).metadata();
    } catch {
      throw new BadRequestException("Uploaded image is invalid or corrupt");
    }

    if (!metadata.width || !metadata.height) {
      throw new BadRequestException("Uploaded image metadata is invalid");
    }

    const expectedFormat = this.getSharpFormatForMimeType(mimeType);

    if (!expectedFormat || metadata.format !== expectedFormat) {
      throw new BadRequestException(
        "Uploaded image format does not match the declared MIME type",
      );
    }

    return {
      width: metadata.width,
      height: metadata.height,
    };
  }

  // Inspects an uploaded video object and validates its container signature
  private async inspectVideoObject(
    objectKey: string,
    mimeType: string,
  ): Promise<{ durationMs: number | null }> {
    const buffer = await this.r2Storage.getObjectBuffer(objectKey);

    const isValidVideo =
      mimeType === "video/mp4"
        ? this.isMp4Buffer(buffer)
        : mimeType === "video/webm"
          ? this.isWebmBuffer(buffer)
          : false;

    if (!isValidVideo) {
      throw new BadRequestException("Uploaded video is invalid or corrupt");
    }

    return {
      durationMs: null,
    };
  }

  // Detects an MP4 file by its ftyp box near the file header
  private isMp4Buffer(buffer: Buffer): boolean {
    if (buffer.length < 12) {
      return false;
    }

    return buffer.subarray(4, 8).toString("ascii") === "ftyp";
  }

  // Detects a WebM file by its EBML header magic bytes
  private isWebmBuffer(buffer: Buffer): boolean {
    if (buffer.length < 4) {
      return false;
    }

    return (
      buffer[0] === 0x1a &&
      buffer[1] === 0x45 &&
      buffer[2] === 0xdf &&
      buffer[3] === 0xa3
    );
  }
}
