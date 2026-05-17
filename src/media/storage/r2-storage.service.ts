import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

import {
  Injectable,
  InternalServerErrorException,
  Logger,
  ServiceUnavailableException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

type CreatePresignedPutUrlParams = {
  objectKey: string;
  contentType: string;
};

type HeadStoredObjectResult = {
  contentLength: number | null;
  contentType: string | null;
  etag: string | null;
};

@Injectable()
export class R2StorageService {
  private readonly logger = new Logger(R2StorageService.name);
  private readonly client: S3Client | null;
  private readonly bucket: string | null;
  private readonly publicBaseUrl: string | null;
  private readonly presignedUrlTtlSeconds: number;

  constructor(private readonly configService: ConfigService) {
    const accountId = this.getOptionalConfig("R2_ACCOUNT_ID");
    const accessKeyId = this.getOptionalConfig("R2_ACCESS_KEY_ID");
    const secretAccessKey = this.getOptionalConfig("R2_SECRET_ACCESS_KEY");
    const bucket = this.getOptionalConfig("R2_BUCKET");
    const publicBaseUrl = this.getOptionalConfig("R2_PUBLIC_BASE_URL");
    this.presignedUrlTtlSeconds =
      this.configService.get<number>("R2_PRESIGNED_URL_TTL_SECONDS") ?? 900;

    if (
      !accountId ||
      !accessKeyId ||
      !secretAccessKey ||
      !bucket ||
      !publicBaseUrl
    ) {
      this.client = null;
      this.bucket = null;
      this.publicBaseUrl = null;
      return;
    }

    this.bucket = bucket;
    this.publicBaseUrl = publicBaseUrl.replace(/\/+$/, "");
    this.client = new S3Client({
      region: "auto",
      endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId,
        secretAccessKey,
      },
    });
  }

  // Creates a presigned PUT URL for a direct client upload
  async createPresignedPutUrl({
    objectKey,
    contentType,
  }: CreatePresignedPutUrlParams): Promise<string> {
    const storage = this.getConfiguredStorage();

    try {
      return await getSignedUrl(
        storage.client,
        new PutObjectCommand({
          Bucket: storage.bucket,
          Key: objectKey,
          ContentType: contentType,
        }),
        {
          expiresIn: this.presignedUrlTtlSeconds,
        },
      );
    } catch {
      throw new InternalServerErrorException(
        "Failed to create media upload URL",
      );
    }
  }

  // Creates a presigned GET URL for temporarily viewing one stored object
  async createPresignedGetUrl(objectKey: string): Promise<string> {
    const storage = this.getConfiguredStorage();

    try {
      return await getSignedUrl(
        storage.client,
        new GetObjectCommand({
          Bucket: storage.bucket,
          Key: objectKey,
        }),
        {
          expiresIn: this.presignedUrlTtlSeconds,
        },
      );
    } catch {
      throw new InternalServerErrorException("Failed to create media view URL");
    }
  }

  // Reads object metadata from R2 without downloading the object body
  async headObject(objectKey: string): Promise<HeadStoredObjectResult | null> {
    const storage = this.getConfiguredStorage();

    try {
      const result = await storage.client.send(
        new HeadObjectCommand({
          Bucket: storage.bucket,
          Key: objectKey,
        }),
      );

      return {
        contentLength: result.ContentLength ?? null,
        contentType: result.ContentType ?? null,
        etag: result.ETag ?? null,
      };
    } catch (error) {
      if (this.isObjectNotFoundError(error)) {
        return null;
      }

      this.logger.error(
        `Failed to read R2 metadata for object ${objectKey}`,
        error instanceof Error ? error.stack : undefined,
      );

      throw new InternalServerErrorException(
        "Failed to read media object metadata",
      );
    }
  }

  // Deletes a stored object from R2
  async deleteObject(objectKey: string): Promise<void> {
    const storage = this.getConfiguredStorage();

    try {
      await storage.client.send(
        new DeleteObjectCommand({
          Bucket: storage.bucket,
          Key: objectKey,
        }),
      );
    } catch (error) {
      this.logger.error(
        `Failed to delete R2 object ${objectKey}`,
        error instanceof Error ? error.stack : undefined,
      );

      throw new InternalServerErrorException("Failed to delete media object");
    }
  }

  // Downloads an object into memory for image inspection
  async getObjectBuffer(objectKey: string): Promise<Buffer> {
    const storage = this.getConfiguredStorage();

    try {
      const result = await storage.client.send(
        new GetObjectCommand({
          Bucket: storage.bucket,
          Key: objectKey,
        }),
      );

      const bytes = await result.Body?.transformToByteArray();

      if (!bytes) {
        throw new InternalServerErrorException("Media object body is empty");
      }

      return Buffer.from(bytes);
    } catch (error) {
      if (error instanceof InternalServerErrorException) throw error;

      this.logger.error(
        `Failed to read R2 object ${objectKey}`,
        error instanceof Error ? error.stack : undefined,
      );

      throw new InternalServerErrorException("Failed to read media object");
    }
  }

  // Builds the public delivery URL for a stored object key
  getPublicUrl(objectKey: string): string {
    const storage = this.getConfiguredStorage();

    return `${storage.publicBaseUrl}/${objectKey}`;
  }

  // Returns the configured upload bucket name
  getBucket(): string {
    return this.getConfiguredStorage().bucket;
  }

  // Returns the configured presigned upload TTL in seconds
  getPresignedUrlTtlSeconds(): number {
    return this.presignedUrlTtlSeconds;
  }

  /** Returns whether the R2-backed media storage dependencies are configured. */
  isConfigured(): boolean {
    return Boolean(this.client && this.bucket && this.publicBaseUrl);
  }

  // Private Helpers
  /** Reads an optional configuration value and treats blank strings as absent. */
  private getOptionalConfig(key: string): string | undefined {
    const value = this.configService.get<string>(key)?.trim();

    return value || undefined;
  }

  /** Returns configured storage values or a clear disabled-media error. */
  private getConfiguredStorage(): {
    client: S3Client;
    bucket: string;
    publicBaseUrl: string;
  } {
    if (!this.client || !this.bucket || !this.publicBaseUrl) {
      throw new ServiceUnavailableException("Media storage is not configured");
    }

    return {
      client: this.client,
      bucket: this.bucket,
      publicBaseUrl: this.publicBaseUrl,
    };
  }

  // Detects storage-provider not-found responses without leaking provider errors
  private isObjectNotFoundError(error: unknown): boolean {
    const statusCode =
      typeof error === "object" &&
      error !== null &&
      "$metadata" in error &&
      typeof error.$metadata === "object" &&
      error.$metadata !== null &&
      "httpStatusCode" in error.$metadata &&
      typeof error.$metadata.httpStatusCode === "number"
        ? error.$metadata.httpStatusCode
        : undefined;

    return statusCode === 404;
  }
}
