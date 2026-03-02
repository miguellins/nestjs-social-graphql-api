// src/common/cache/cache-helper.service.spec.ts
import { CACHE_MANAGER } from "@nestjs/cache-manager";
import { Test } from "@nestjs/testing";

import { CacheHelperService } from "./cache-helper.service";

describe("CacheHelperService", () => {
  let service: CacheHelperService;

  const cacheMock: {
    get: jest.Mock;
    set: jest.Mock;
    del: jest.Mock;
  } = {
    get: jest.fn(),
    set: jest.fn(),
    del: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const moduleRef = await Test.createTestingModule({
      providers: [
        CacheHelperService,
        { provide: CACHE_MANAGER, useValue: cacheMock },
      ],
    }).compile();

    service = moduleRef.get(CacheHelperService);
  });

  describe("get", () => {
    it("returns cached value when present", async () => {
      cacheMock.get.mockResolvedValue("value");

      const res = await service.get<string>("k");

      expect(cacheMock.get).toHaveBeenCalledWith("k");
      expect(res).toBe("value");
    });

    it("returns undefined when cache returns null/undefined", async () => {
      cacheMock.get.mockResolvedValue(null);

      const res1 = await service.get("k1");
      expect(res1).toBeUndefined();

      cacheMock.get.mockResolvedValue(undefined);

      const res2 = await service.get("k2");
      expect(res2).toBeUndefined();
    });
  });

  describe("set", () => {
    it("delegates to cache.set with ttlMs", async () => {
      cacheMock.set.mockResolvedValue(undefined);

      await service.set("k", { a: 1 }, 1234);

      expect(cacheMock.set).toHaveBeenCalledWith("k", { a: 1 }, 1234);
    });
  });

  describe("del", () => {
    it("delegates to cache.del", async () => {
      cacheMock.del.mockResolvedValue(undefined);

      await service.del("k");

      expect(cacheMock.del).toHaveBeenCalledWith("k");
    });
  });

  describe("getOrSet", () => {
    it("returns cached value and does NOT call factory nor set (cache hit)", async () => {
      cacheMock.get.mockResolvedValue({ ok: true });

      const factory = jest.fn(() => Promise.resolve({ ok: false }));

      const res = await service.getOrSet("k", factory, 1000);

      expect(cacheMock.get).toHaveBeenCalledWith("k");
      expect(factory).not.toHaveBeenCalled();
      expect(cacheMock.set).not.toHaveBeenCalled();
      expect(res).toEqual({ ok: true });
    });

    it("calls factory, sets cache, and returns data (cache miss)", async () => {
      cacheMock.get.mockResolvedValue(undefined);

      const factory = jest.fn(() => Promise.resolve({ ok: true }));

      const res = await service.getOrSet("k", factory, 1000);

      expect(cacheMock.get).toHaveBeenCalledWith("k");
      expect(factory).toHaveBeenCalledTimes(1);
      expect(cacheMock.set).toHaveBeenCalledWith("k", { ok: true }, 1000);
      expect(res).toEqual({ ok: true });
    });

    it("does NOT set cache when factory throws", async () => {
      cacheMock.get.mockResolvedValue(undefined);

      const factory = jest.fn(() => Promise.reject(new Error("boom")));

      await expect(service.getOrSet("k", factory, 1000)).rejects.toThrow(
        "boom",
      );

      expect(factory).toHaveBeenCalledTimes(1);
      expect(cacheMock.set).not.toHaveBeenCalled();
    });
  });

  describe("getVersion", () => {
    it("returns cached version when present", async () => {
      cacheMock.get.mockResolvedValue(7);

      const v = await service.getVersion("v:key");

      expect(cacheMock.get).toHaveBeenCalledWith("v:key");
      expect(v).toBe(7);
    });

    it("defaults to 1 when version key not set", async () => {
      cacheMock.get.mockResolvedValue(undefined);

      const v = await service.getVersion("v:key");

      expect(v).toBe(1);
    });
  });

  describe("bumpVersion", () => {
    it("increments existing version and sets long TTL (1 year)", async () => {
      cacheMock.get.mockResolvedValue(10);

      await service.bumpVersion("v:list");

      const oneYearMs = 365 * 24 * 60 * 60_000;

      // bumpVersion -> getVersion -> get -> cache.get called
      expect(cacheMock.get).toHaveBeenCalledWith("v:list");

      expect(cacheMock.set).toHaveBeenCalledWith("v:list", 11, oneYearMs);
    });

    it("defaults missing version to 1 and sets to 2", async () => {
      cacheMock.get.mockResolvedValue(undefined);

      await service.bumpVersion("v:list");

      const oneYearMs = 365 * 24 * 60 * 60_000;

      expect(cacheMock.set).toHaveBeenCalledWith("v:list", 2, oneYearMs);
    });
  });
});
