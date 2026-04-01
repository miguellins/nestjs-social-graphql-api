import { InternalServerErrorException, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Test, TestingModule } from "@nestjs/testing";

import { R2StorageService } from "@/media/storage/r2-storage.service";

const sendMock = jest.fn();
const signedUrlMock = jest.fn<Promise<string>, unknown[]>();
const s3ClientConstructorMock = jest.fn();

jest.mock("@aws-sdk/client-s3", () => {
  class S3Client {
    constructor(options: unknown) {
      s3ClientConstructorMock(options);
    }

    send = sendMock;
  }

  class PutObjectCommand {
    constructor(public readonly input: unknown) {}
  }

  class HeadObjectCommand {
    constructor(public readonly input: unknown) {}
  }

  class GetObjectCommand {
    constructor(public readonly input: unknown) {}
  }

  class DeleteObjectCommand {
    constructor(public readonly input: unknown) {}
  }

  return {
    S3Client,
    PutObjectCommand,
    HeadObjectCommand,
    GetObjectCommand,
    DeleteObjectCommand,
  };
});

jest.mock("@aws-sdk/s3-request-presigner", () => ({
  getSignedUrl: (...args: unknown[]) => {
    return signedUrlMock(...args);
  },
}));

describe("R2StorageService", () => {
  let service: R2StorageService;
  let moduleRef: TestingModule;

  const configGetMock = jest.fn();

  beforeEach(async () => {
    jest.clearAllMocks();

    configGetMock.mockImplementation((key: string) => {
      switch (key) {
        case "R2_ACCOUNT_ID":
          return "account-id";
        case "R2_ACCESS_KEY_ID":
          return "access-key-id";
        case "R2_SECRET_ACCESS_KEY":
          return "secret-access-key";
        case "R2_BUCKET":
          return "app-photos-videos";
        case "R2_PUBLIC_BASE_URL":
          return "https://media.example.com/";
        case "R2_PRESIGNED_URL_TTL_SECONDS":
          return 1800;
        default:
          return undefined;
      }
    });

    moduleRef = await Test.createTestingModule({
      providers: [
        R2StorageService,
        {
          provide: ConfigService,
          useValue: {
            get: configGetMock,
          },
        },
      ],
    }).compile();

    service = moduleRef.get(R2StorageService);
  });

  afterEach(async () => {
    await moduleRef?.close();
  });

  it("constructs the S3 client with the R2 endpoint and credentials", () => {
    expect(s3ClientConstructorMock).toHaveBeenCalledWith({
      region: "auto",
      endpoint: "https://account-id.r2.cloudflarestorage.com",
      credentials: {
        accessKeyId: "access-key-id",
        secretAccessKey: "secret-access-key",
      },
    });
  });

  it("creates a presigned PUT URL", async () => {
    signedUrlMock.mockResolvedValue("https://upload.example.com");

    await expect(
      service.createPresignedPutUrl({
        objectKey: "posts/11/media/key/original.jpg",
        contentType: "image/jpeg",
      }),
    ).resolves.toBe("https://upload.example.com");

    expect(signedUrlMock).toHaveBeenCalledWith(
      expect.any(Object),
      expect.objectContaining({
        input: {
          Bucket: "app-photos-videos",
          Key: "posts/11/media/key/original.jpg",
          ContentType: "image/jpeg",
        },
      }),
      { expiresIn: 1800 },
    );
  });

  it("creates a presigned GET URL", async () => {
    signedUrlMock.mockResolvedValue("https://view.example.com");

    await expect(
      service.createPresignedGetUrl("posts/11/media/key/original.jpg"),
    ).resolves.toBe("https://view.example.com");

    expect(signedUrlMock).toHaveBeenCalledWith(
      expect.any(Object),
      expect.objectContaining({
        input: {
          Bucket: "app-photos-videos",
          Key: "posts/11/media/key/original.jpg",
        },
      }),
      { expiresIn: 1800 },
    );
  });

  it("returns object metadata from headObject", async () => {
    sendMock.mockResolvedValue({
      ContentLength: 123,
      ContentType: "image/jpeg",
      ETag: "etag-1",
    });

    await expect(
      service.headObject("posts/11/media/key/original.jpg"),
    ).resolves.toEqual({
      contentLength: 123,
      contentType: "image/jpeg",
      etag: "etag-1",
    });
  });

  it("returns null from headObject when the object does not exist", async () => {
    sendMock.mockRejectedValue({
      $metadata: {
        httpStatusCode: 404,
      },
    });

    await expect(
      service.headObject("posts/11/media/key/original.jpg"),
    ).resolves.toBeNull();
  });

  it("builds the public URL without keeping a trailing base slash", () => {
    expect(service.getPublicUrl("posts/11/media/key/original.jpg")).toBe(
      "https://media.example.com/posts/11/media/key/original.jpg",
    );
  });

  it("returns the configured bucket and presigned TTL", () => {
    expect(service.getBucket()).toBe("app-photos-videos");
    expect(service.getPresignedUrlTtlSeconds()).toBe(1800);
  });

  it("reads an object body into a buffer", async () => {
    sendMock.mockResolvedValue({
      Body: {
        transformToByteArray: jest
          .fn()
          .mockResolvedValue(Uint8Array.from([1, 2, 3])),
      },
    });

    await expect(
      service.getObjectBuffer("posts/11/media/key/original.jpg"),
    ).resolves.toEqual(Buffer.from([1, 2, 3]));
  });

  it("throws a sanitized error when createPresignedPutUrl fails", async () => {
    signedUrlMock.mockRejectedValue(new Error("boom"));

    await expect(
      service.createPresignedPutUrl({
        objectKey: "posts/11/media/key/original.jpg",
        contentType: "image/jpeg",
      }),
    ).rejects.toBeInstanceOf(InternalServerErrorException);
  });

  it("throws a sanitized error when createPresignedGetUrl fails", async () => {
    signedUrlMock.mockRejectedValue(new Error("boom"));

    await expect(
      service.createPresignedGetUrl("posts/11/media/key/original.jpg"),
    ).rejects.toBeInstanceOf(InternalServerErrorException);
  });

  it("logs and throws a sanitized error when object deletion fails", async () => {
    const loggerErrorSpy = jest
      .spyOn(Logger.prototype, "error")
      .mockImplementation(() => undefined);

    sendMock.mockRejectedValue(new Error("boom"));

    await expect(
      service.deleteObject("posts/11/media/key/original.jpg"),
    ).rejects.toBeInstanceOf(InternalServerErrorException);

    expect(loggerErrorSpy).toHaveBeenCalledWith(
      "Failed to delete R2 object posts/11/media/key/original.jpg",
      expect.any(String),
    );

    loggerErrorSpy.mockRestore();
  });
});
