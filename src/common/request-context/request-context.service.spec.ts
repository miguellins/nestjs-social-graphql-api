import { RequestContextService } from "@/common/request-context/request-context.service";

describe("RequestContextService", () => {
  let service: RequestContextService;

  beforeEach(() => {
    service = new RequestContextService();
  });

  it("stores and updates request-scoped context inside AsyncLocalStorage", async () => {
    await service.run({ requestId: "req-1" }, async () => {
      service.setUserId(42);
      service.setOperationName("CreatePost");

      await Promise.resolve();

      expect(service.get("requestId")).toBe("req-1");
      expect(service.get("userId")).toBe(42);
      expect(service.get("operationName")).toBe("CreatePost");
    });
  });

  it("returns undefined when no async context is active", () => {
    expect(service.getStore()).toBeUndefined();
    expect(service.get("requestId")).toBeUndefined();
  });

  it("does not throw when setters are called outside an active async context", () => {
    expect(() => {
      service.setRequestId("req-2");
      service.setUserId(7);
      service.setOperationName("FeedQuery");
    }).not.toThrow();

    expect(service.getStore()).toBeUndefined();
  });

  it("keeps nested async contexts isolated", () => {
    service.run({ requestId: "outer" }, () => {
      service.setUserId(1);

      service.run({ requestId: "inner" }, () => {
        service.setUserId(2);

        expect(service.getStore()).toEqual({
          requestId: "inner",
          userId: 2,
        });
      });

      expect(service.getStore()).toEqual({
        requestId: "outer",
        userId: 1,
      });
    });
  });
});
