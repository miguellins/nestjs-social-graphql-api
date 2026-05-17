import { NotFoundException } from "@nestjs/common";
import { Test, TestingModule } from "@nestjs/testing";

import { CacheHelperService } from "@/common/cache/cache-helper.service";
import { R2StorageService } from "@/media/storage/r2-storage.service";
import { PrismaService } from "@/prisma/prisma.service";
import { AccountState } from "@/users/enums/account-state.enum";
import { UserPrivacySetting } from "@/users/enums/user-privacy-setting.enum";
import { USER_ROLE } from "@/users/enums/user-role.enum";
import { UserCacheService } from "@/users/user-cache.service";
import { UserProfileReadService } from "@/users/user-profile-read.service";

import { MediaStatus } from "@prisma/client";

describe("UserProfileReadService", () => {
  let service: UserProfileReadService;
  let moduleRef: TestingModule;

  const makeUser = (overrides: Record<string, unknown> = {}) => ({
    id: 2,
    name: "Profile User",
    username: "profileuser",
    bio: "Hello",
    websiteUrl: "https://example.com",
    location: "Recife",
    privacySetting: UserPrivacySetting.PUBLIC,
    accountState: AccountState.ACTIVE,
    isEmailVerified: true,
    createdAt: new Date("2026-04-01T00:00:00.000Z"),
    updatedAt: new Date("2026-04-02T00:00:00.000Z"),
    avatarMedia: {
      id: 9,
      status: MediaStatus.READY,
      objectKey: "users/2/avatar/key/original.png",
    },
    _count: {
      likes: 1,
      posts: 2,
      followers: 3,
      following: 4,
    },
    ...overrides,
  });

  const prismaMock = {
    user: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
    },
    userBlock: {
      findFirst: jest.fn(),
    },
    follow: {
      findUnique: jest.fn(),
    },
  };

  const cacheMock = {
    getOrSet: jest.fn(),
    get: jest.fn(),
    set: jest.fn(),
  };

  const r2StorageMock = {
    isConfigured: jest.fn(),
    getPublicUrl: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    cacheMock.getOrSet.mockImplementation(
      async (_key: string, factory: () => Promise<unknown>) => factory(),
    );
    r2StorageMock.isConfigured.mockReturnValue(true);
    r2StorageMock.getPublicUrl.mockImplementation(
      (key: string) => `https://media.example.com/${key}`,
    );

    moduleRef = await Test.createTestingModule({
      providers: [
        UserCacheService,
        UserProfileReadService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: CacheHelperService, useValue: cacheMock },
        { provide: R2StorageService, useValue: r2StorageMock },
      ],
    }).compile();

    service = moduleRef.get(UserProfileReadService);
  });

  afterEach(async () => {
    await moduleRef?.close();
  });

  it("returns public profiles to anonymous viewers and derives READY avatarUrl", async () => {
    prismaMock.user.findUnique.mockResolvedValue(makeUser());

    await expect(service.getUser(2)).resolves.toEqual(
      expect.objectContaining({
        id: 2,
        avatarUrl: "https://media.example.com/users/2/avatar/key/original.png",
      }),
    );

    expect(prismaMock.userBlock.findFirst).not.toHaveBeenCalled();
    expect(prismaMock.follow.findUnique).not.toHaveBeenCalled();
  });

  it("returns NotFound for private profiles viewed anonymously", async () => {
    prismaMock.user.findUnique.mockResolvedValue(
      makeUser({ privacySetting: UserPrivacySetting.PRIVATE }),
    );

    await expect(service.getUser(2)).rejects.toBeInstanceOf(NotFoundException);
  });

  it("returns NotFound when either viewer blocks the other user", async () => {
    prismaMock.user.findUnique.mockResolvedValue(makeUser());
    prismaMock.userBlock.findFirst.mockResolvedValue({ id: 1 });

    await expect(
      service.getUser(2, { id: 7, role: USER_ROLE.USER }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it("allows an approved follower to view a private profile", async () => {
    prismaMock.user.findUnique.mockResolvedValue(
      makeUser({ privacySetting: UserPrivacySetting.PRIVATE }),
    );
    prismaMock.userBlock.findFirst.mockResolvedValue(null);
    prismaMock.follow.findUnique.mockResolvedValue({ id: 1 });

    await expect(
      service.getUser(2, { id: 7, role: USER_ROLE.USER }),
    ).resolves.toEqual(expect.objectContaining({ id: 2 }));
  });

  it("returns NotFound for suspended and deactivated profiles", async () => {
    prismaMock.user.findUnique.mockResolvedValue(
      makeUser({ accountState: AccountState.SUSPENDED }),
    );

    await expect(service.getUser(2)).rejects.toBeInstanceOf(NotFoundException);

    prismaMock.user.findUnique.mockResolvedValue(
      makeUser({ accountState: AccountState.DEACTIVATED }),
    );

    await expect(service.getUser(2)).rejects.toBeInstanceOf(NotFoundException);
  });
});
