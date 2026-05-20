import { Test, TestingModule } from "@nestjs/testing";

import { CacheHelperService } from "@/common/cache/cache-helper.service";
import { PostCacheService } from "@/posts/post-cache.service";

describe("PostCacheService", () => {
  let service: PostCacheService;
  let moduleRef: TestingModule;

  const cacheMock = {
    bumpVersion: jest.fn(),
    del: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    cacheMock.bumpVersion.mockResolvedValue(undefined);
    cacheMock.del.mockResolvedValue(undefined);

    moduleRef = await Test.createTestingModule({
      providers: [
        PostCacheService,
        { provide: CacheHelperService, useValue: cacheMock },
      ],
    }).compile();

    service = moduleRef.get(PostCacheService);
  });

  afterEach(async () => {
    await moduleRef?.close();
  });

  it("invalidates public, author, hashtag, and user caches after create", async () => {
    await service.invalidateAfterCreatePost(10, 7, true);

    expect(cacheMock.bumpVersion).toHaveBeenNthCalledWith(1, "v:posts:list");
    expect(cacheMock.bumpVersion).toHaveBeenNthCalledWith(
      2,
      "v:user:7:posts:list",
    );
    expect(cacheMock.bumpVersion).toHaveBeenNthCalledWith(3, "v:hashtags:list");
    expect(cacheMock.del).toHaveBeenCalledWith("user:safe:7");
    expect(cacheMock.bumpVersion).toHaveBeenNthCalledWith(4, "v:user:list");
  });

  it("skips hashtag version bumps when public hashtag counts did not change", async () => {
    await service.invalidateAfterUpdatePost(10, 7, false);

    expect(cacheMock.del).toHaveBeenCalledWith("posts:detail:10");
    expect(cacheMock.bumpVersion).toHaveBeenCalledWith("v:posts:list");
    expect(cacheMock.bumpVersion).toHaveBeenCalledWith("v:user:7:posts:list");
    expect(cacheMock.bumpVersion).not.toHaveBeenCalledWith("v:hashtags:list");
  });

  it("invalidates detail and author caches after moderator removal", async () => {
    await service.invalidateAfterModeratorRemovePost(10, 7, true);

    expect(cacheMock.del).toHaveBeenCalledWith("posts:detail:10");
    expect(cacheMock.bumpVersion).toHaveBeenCalledWith("v:posts:list");
    expect(cacheMock.bumpVersion).toHaveBeenCalledWith("v:user:7:posts:list");
    expect(cacheMock.bumpVersion).toHaveBeenCalledWith("v:hashtags:list");
  });
});
