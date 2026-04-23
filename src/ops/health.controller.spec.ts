import { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";

import { HealthController } from "@/ops/health.controller";
import { HealthService } from "@/ops/health.service";

import request from "supertest";

describe("HealthController", () => {
  let app: INestApplication;

  const healthServiceMock = {
    liveness: jest.fn(),
    readiness: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    healthServiceMock.liveness.mockResolvedValue({ status: "ok" });
    healthServiceMock.readiness.mockResolvedValue({ status: "ok" });

    const moduleRef = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [{ provide: HealthService, useValue: healthServiceMock }],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  it("serves GET /health/live", async () => {
    const httpServer = app.getHttpServer() as Parameters<typeof request>[0];

    await request(httpServer)
      .get("/health/live")
      .expect(200)
      .expect({ status: "ok" });

    expect(healthServiceMock.liveness).toHaveBeenCalled();
  });

  it("serves GET /health/ready", async () => {
    const httpServer = app.getHttpServer() as Parameters<typeof request>[0];

    await request(httpServer)
      .get("/health/ready")
      .expect(200)
      .expect({ status: "ok" });

    expect(healthServiceMock.readiness).toHaveBeenCalled();
  });
});
