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
  private readonly client: S3Client;
  private readonly bucket: string;
  private readonly publicBaseUrl: string;
  private readonly presignedUrlTtlSeconds: number;

  constructor(private readonly configService: ConfigService) {
    const accountId = this.getRequiredConfig("R2_ACCOUNT_ID");
    const accessKeyId = this.getRequiredConfig("R2_ACCESS_KEY_ID");
    const secretAccessKey = this.getRequiredConfig("R2_SECRET_ACCESS_KEY");

    this.bucket = this.getRequiredConfig("R2_BUCKET");
    this.publicBaseUrl = this.getRequiredConfig("R2_PUBLIC_BASE_URL").replace(
      /\/+$/,
      "",
    );
    this.presignedUrlTtlSeconds =
      this.configService.get<number>("R2_PRESIGNED_URL_TTL_SECONDS") ?? 900;

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
    try {
      return await getSignedUrl(
        this.client,
        new PutObjectCommand({
          Bucket: this.bucket,
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
    try {
      return await getSignedUrl(
        this.client,
        new GetObjectCommand({
          Bucket: this.bucket,
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
    try {
      const result = await this.client.send(
        new HeadObjectCommand({
          Bucket: this.bucket,
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
    try {
      await this.client.send(
        new DeleteObjectCommand({
          Bucket: this.bucket,
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
    try {
      const result = await this.client.send(
        new GetObjectCommand({
          Bucket: this.bucket,
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
    return `${this.publicBaseUrl}/${objectKey}`;
  }

  // Returns the configured upload bucket name
  getBucket(): string {
    return this.bucket;
  }

  // Returns the configured presigned upload TTL in seconds
  getPresignedUrlTtlSeconds(): number {
    return this.presignedUrlTtlSeconds;
  }

  // Private Helpers
  // Reads a required configuration value and fails fast if it is missing
  private getRequiredConfig(key: string): string {
    const value = this.configService.get<string>(key)?.trim();

    if (!value) {
      throw new Error(`${key} is not defined`);
    }

    return value;
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
