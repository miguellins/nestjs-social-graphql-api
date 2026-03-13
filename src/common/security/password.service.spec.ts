import { ConfigService } from "@nestjs/config";
import { Test, TestingModule } from "@nestjs/testing";

import { PASSWORD_HASH_PREFIX } from "@/common/constants/security.constants";
import { PasswordService } from "@/common/security/password.service";

import * as bcrypt from "bcrypt";

jest.mock("bcrypt", () => ({
  hash: jest.fn(),
  compare: jest.fn(),
}));

describe("PasswordService", () => {
  let service: PasswordService;
  let moduleRef: TestingModule;

  const configMock = {
    get: jest.fn(),
  };

  const hashMock = bcrypt.hash as jest.Mock;
  const compareMock = bcrypt.compare as jest.Mock;

  beforeEach(async () => {
    jest.clearAllMocks();
    configMock.get.mockReturnValue("pepper-secret");

    moduleRef = await Test.createTestingModule({
      providers: [
        PasswordService,
        { provide: ConfigService, useValue: configMock },
      ],
    }).compile();

    service = moduleRef.get(PasswordService);
  });

  afterEach(async () => {
    await moduleRef?.close();
  });

  it("hashes passwords into the peppered format", async () => {
    hashMock.mockResolvedValue("$2b$12$peppered-bcrypt-hash");

    const result = await service.hashPassword("secret123");

    expect(hashMock).toHaveBeenCalled();
    expect(result).toBe(`${PASSWORD_HASH_PREFIX}$2b$12$peppered-bcrypt-hash`);
  });

  it("verifies current peppered hashes without requesting an upgrade", async () => {
    compareMock.mockResolvedValue(true);

    const result = await service.verifyPassword(
      "secret123",
      `${PASSWORD_HASH_PREFIX}$2b$12$current-hash`,
    );

    expect(compareMock).toHaveBeenCalled();
    expect(result).toEqual({ isValid: true });
  });

  it("verifies legacy bcrypt hashes and returns an upgraded hash", async () => {
    compareMock.mockResolvedValueOnce(true);
    hashMock.mockResolvedValue("$2b$12$new-peppered-hash");

    const result = await service.verifyPassword("secret123", "$2b$12$legacy-hash");

    expect(result).toEqual({
      isValid: true,
      upgradedHash: `${PASSWORD_HASH_PREFIX}$2b$12$new-peppered-hash`,
    });
  });

  it("returns invalid when neither current nor legacy verification succeeds", async () => {
    compareMock.mockResolvedValue(false);

    const result = await service.verifyPassword("secret123", "$2b$12$bad-hash");

    expect(result).toEqual({ isValid: false });
  });
});
