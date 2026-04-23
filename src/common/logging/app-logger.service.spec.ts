import { AppLoggerService } from "@/common/logging/app-logger.service";
import { RequestContextService } from "@/common/request-context/request-context.service";

describe("AppLoggerService", () => {
  const stdoutWriteMock = jest.fn();
  const stderrWriteMock = jest.fn();
  const originalNodeEnv = process.env.NODE_ENV;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.NODE_ENV = "production";
    jest.spyOn(process.stdout, "write").mockImplementation(stdoutWriteMock);
    jest.spyOn(process.stderr, "write").mockImplementation(stderrWriteMock);
  });

  afterEach(() => {
    jest.restoreAllMocks();
    process.env.NODE_ENV = originalNodeEnv;
  });

  it("emits JSON error logs enriched with request context", () => {
    const requestContextService = new RequestContextService();
    const logger = new AppLoggerService(requestContextService);

    requestContextService.run(
      {
        requestId: "req-123",
        userId: 9,
        operationName: "CreatePost",
      },
      () => {
        logger.error("Readiness check failed", "stacktrace", "HealthService");
      },
    );

    const stderrCalls = stderrWriteMock.mock.calls as Array<[string]>;
    const output = stderrCalls[0]?.[0];
    const entry = JSON.parse(String(output).trim()) as Record<string, unknown>;

    expect(entry).toMatchObject({
      level: "error",
      message: "Readiness check failed",
      requestId: "req-123",
      userId: 9,
      operationName: "CreatePost",
      service: "HealthService",
      stack: "stacktrace",
    });
  });

  it("emits pretty stdout logs with metadata in non-production", () => {
    process.env.NODE_ENV = "development";

    const requestContextService = new RequestContextService();
    const logger = new AppLoggerService(requestContextService);

    requestContextService.run(
      {
        requestId: "req-456",
        userId: 21,
        operationName: "HealthQuery",
      },
      () => {
        logger.log(
          "Request completed",
          {
            method: "GET",
            path: "/health/ready",
          },
          "HealthController",
        );
      },
    );

    const output = String(
      (stdoutWriteMock.mock.calls as Array<[string]>)[0]?.[0],
    );

    expect(output).toContain("INFO Request completed");
    expect(output).toContain("[HealthController]");
    expect(output).toContain("requestId=req-456");
    expect(output).toContain("userId=21");
    expect(output).toContain("operationName=HealthQuery");
    expect(output).toContain("method=GET");
    expect(output).toContain("path=/health/ready");
  });

  it("derives error name and stack from Error instances when no stack param is passed", () => {
    const requestContextService = new RequestContextService();
    const logger = new AppLoggerService(requestContextService);
    const error = new TypeError("Pubsub failed");

    logger.error(
      error,
      {
        errorName: "PubsubUnavailable",
        method: "POST",
        path: "/graphql",
      },
      "GraphqlPubSubService",
    );

    const stderrCalls = stderrWriteMock.mock.calls as Array<[string]>;
    const output = stderrCalls[0]?.[0];
    const entry = JSON.parse(String(output).trim()) as Record<string, unknown>;

    expect(entry).toMatchObject({
      level: "error",
      message: "Pubsub failed",
      service: "GraphqlPubSubService",
      errorName: "PubsubUnavailable",
      method: "POST",
      path: "/graphql",
      stack: error.stack,
    });
  });
});
