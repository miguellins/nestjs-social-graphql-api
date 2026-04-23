import { RequestContextMiddleware } from "@/common/request-context/request-context.middleware";
import { RequestContextService } from "@/common/request-context/request-context.service";

describe("RequestContextMiddleware", () => {
  let requestContextService: RequestContextService;
  let middleware: RequestContextMiddleware;

  beforeEach(() => {
    requestContextService = new RequestContextService();
    middleware = new RequestContextMiddleware(requestContextService);
  });

  it("preserves the incoming x-request-id header and exposes it through context storage", () => {
    const req = {
      headers: {
        "x-request-id": "incoming-id",
      },
    };
    const res = {
      setHeader: jest.fn<void, [string, string]>(),
    };
    const next = jest.fn(() => {
      expect(requestContextService.get("requestId")).toBe("incoming-id");
    });

    middleware.use(req as never, res as never, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(req).toEqual(
      expect.objectContaining({
        requestId: "incoming-id",
      }),
    );
    expect(res.setHeader).toHaveBeenCalledWith("x-request-id", "incoming-id");
  });

  it("generates a UUID when the request id header is missing", () => {
    const req = { headers: {} };
    const res = {
      setHeader: jest.fn<void, [string, string]>(),
    };

    middleware.use(req as never, res as never, jest.fn());

    const generatedRequestId = (req as { requestId?: string }).requestId;

    expect(generatedRequestId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
    expect(res.setHeader).toHaveBeenCalledWith(
      "x-request-id",
      generatedRequestId,
    );
  });

  it("trims string request ids from the incoming header", () => {
    const req = {
      headers: {
        "x-request-id": "  trimmed-id  ",
      },
    };
    const res = {
      setHeader: jest.fn<void, [string, string]>(),
    };

    middleware.use(req as never, res as never, jest.fn());

    expect(req).toEqual(
      expect.objectContaining({
        requestId: "trimmed-id",
      }),
    );
    expect(res.setHeader).toHaveBeenCalledWith("x-request-id", "trimmed-id");
  });

  it("uses the first non-empty value when the request id header is an array", () => {
    const req = {
      headers: {
        "x-request-id": ["", "  array-id  ", "ignored"],
      },
    };
    const res = {
      setHeader: jest.fn<void, [string, string]>(),
    };

    middleware.use(req as never, res as never, jest.fn());

    expect(req).toEqual(
      expect.objectContaining({
        requestId: "array-id",
      }),
    );
    expect(res.setHeader).toHaveBeenCalledWith("x-request-id", "array-id");
  });
});
