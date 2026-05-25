import {
  BadRequestException,
  ForbiddenException,
  InternalServerErrorException,
} from "@nestjs/common";

import { SearchUsersReadService } from "@/search/search-users-read.service";
import { SafeUserSelect } from "@/users/dto/safe-user.dto";
import { AccountState } from "@/users/enums/account-state.enum";
import { UserPrivacySetting } from "@/users/enums/user-privacy-setting.enum";

describe("SearchUsersReadService", () => {
  const makeUser = (id: number) => ({
    id,
    name: `User ${id}`,
    username: `user${id}`,
    bio: null,
    websiteUrl: null,
    location: null,
    avatarMedia: null,
    privacySetting: UserPrivacySetting.PRIVATE,
    accountState: AccountState.ACTIVE,
    isEmailVerified: false,
    createdAt: new Date(`2026-05-${String(id).padStart(2, "0")}T00:00:00.000Z`),
    updatedAt: new Date(`2026-05-${String(id).padStart(2, "0")}T00:00:00.000Z`),
    _count: {
      likes: 0,
      posts: 0,
      followers: 0,
      following: 0,
    },
  });

  const prismaMock = {
    $queryRaw: jest.fn(),
    user: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
    },
  };
  const cacheHelperMock = {
    getVersion: jest.fn(),
    getOrSet: jest.fn(),
  };
  const postReadServiceMock = {
    getBlockedAuthorIds: jest.fn(),
  };

  let service: SearchUsersReadService;

  beforeEach(() => {
    jest.clearAllMocks();
    prismaMock.$queryRaw.mockResolvedValue([{ id: 2 }, { id: 1 }]);
    prismaMock.user.findMany.mockResolvedValue([makeUser(1), makeUser(2)]);
    prismaMock.user.findUnique.mockResolvedValue({
      accountState: AccountState.ACTIVE,
    });
    cacheHelperMock.getVersion.mockResolvedValue(3);
    cacheHelperMock.getOrSet.mockImplementation(
      async (_key: string, factory: () => Promise<unknown>) => factory(),
    );
    postReadServiceMock.getBlockedAuthorIds.mockResolvedValue([]);

    service = new SearchUsersReadService(
      prismaMock as never,
      cacheHelperMock as never,
      postReadServiceMock as never,
    );
  });

  it("uses ACTIVE-only raw search, versioned cache, safe hydrate select, and raw ordering", async () => {
    const result = await service.searchUsers({ q: " @User ", first: 5 });

    expect(cacheHelperMock.getVersion).toHaveBeenCalledWith("v:search:users");
    expect(cacheHelperMock.getOrSet).toHaveBeenCalledWith(
      "search:users:v3:q=user:viewer=anon:first=5",
      expect.any(Function),
      60_000,
    );
    expect(prismaMock.$queryRaw).toHaveBeenCalledTimes(1);
    expect(prismaMock.user.findMany).toHaveBeenCalledWith({
      where: {
        id: { in: [2, 1] },
        accountState: AccountState.ACTIVE,
      },
      select: SafeUserSelect,
    });
    expect(result.map((user) => user.id)).toEqual([2, 1]);
    expect(result[0]).not.toHaveProperty("email");
  });

  it("drops mutually blocked user ids before hydration and may return sparse results", async () => {
    postReadServiceMock.getBlockedAuthorIds.mockResolvedValue([2]);
    prismaMock.user.findMany.mockResolvedValue([makeUser(1)]);

    const result = await service.searchUsers(
      { q: "user", first: 5 },
      { id: 7 },
    );

    expect(postReadServiceMock.getBlockedAuthorIds).toHaveBeenCalledWith(7);
    expect(prismaMock.user.findMany).toHaveBeenCalledWith({
      where: {
        id: { in: [1] },
        accountState: AccountState.ACTIVE,
      },
      select: SafeUserSelect,
    });
    expect(result).toHaveLength(1);
  });

  it("rejects invalid input and suspended viewers", async () => {
    await expect(service.searchUsers({ q: "***", first: 5 })).rejects.toThrow(
      BadRequestException,
    );

    prismaMock.user.findUnique.mockResolvedValue({
      accountState: AccountState.SUSPENDED,
    });

    await expect(
      service.searchUsers({ q: "user", first: 5 }, { id: 7 }),
    ).rejects.toThrow(ForbiddenException);
  });

  it("maps raw and Prisma failures to sanitized errors", async () => {
    prismaMock.$queryRaw.mockRejectedValue(new Error("sql leaked"));

    await expect(service.searchUsers({ q: "user", first: 5 })).rejects.toThrow(
      InternalServerErrorException,
    );
  });
});
