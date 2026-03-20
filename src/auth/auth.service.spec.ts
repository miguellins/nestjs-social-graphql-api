import {
  BadRequestException,
  InternalServerErrorException,
  UnauthorizedException,
} from "@nestjs/common";

import { Test, TestingModule } from "@nestjs/testing";

import { JwtService } from "@nestjs/jwt";

import { Prisma } from "@prisma/client";

import { PasswordService } from "@/common/security/password.service";

import { PrismaService } from "@/prisma.service";

import { AuthService } from "./auth.service";

describe("AuthService", () => {
  let service: AuthService;
  let moduleRef: TestingModule;
  const findUniqueMock = jest.fn();
  const updateMock = jest.fn();
  const signAsyncMock = jest.fn();
  const verifyPasswordMock = jest.fn();

  const prismaMock = {
    user: {
      findUnique: findUniqueMock,
      update: updateMock,
    },
  } as unknown as PrismaService;

  const jwtMock = {
    signAsync: signAsyncMock,
  } as unknown as JwtService;

  const passwordMock = {
    verifyPassword: verifyPasswordMock,
  } as unknown as PasswordService;

  beforeEach(async () => {
    jest.clearAllMocks();

    moduleRef = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: JwtService, useValue: jwtMock },
        { provide: PasswordService, useValue: passwordMock },
      ],
    }).compile();

    service = moduleRef.get(AuthService);
  });

  afterEach(async () => {
    await moduleRef?.close();
  });

  describe("login", () => {
    it("throws BadRequestException when username is missing", async () => {
      await expect(
        service.login({ username: "", password: "123" }),
      ).rejects.toBeInstanceOf(BadRequestException);

      await expect(
        service.login({ username: "   ", password: "123" }),
      ).rejects.toBeInstanceOf(BadRequestException);

      expect(findUniqueMock).not.toHaveBeenCalled();
    });

    it("throws BadRequestException when password is missing", async () => {
      await expect(
        service.login({ username: "john", password: "" }),
      ).rejects.toBeInstanceOf(BadRequestException);

      await expect(
        service.login({ username: "john", password: "   " }),
      ).rejects.toBeInstanceOf(BadRequestException);

      expect(findUniqueMock).not.toHaveBeenCalled();
    });

    it("normalizes username (trim + lowercase) before querying Prisma", async () => {
      findUniqueMock.mockResolvedValue(null);

      await expect(
        service.login({ username: "  JoHn  ", password: "pass" }),
      ).rejects.toBeInstanceOf(UnauthorizedException);

      expect(findUniqueMock).toHaveBeenCalledWith({
        where: { username: "john" },
        select: { id: true, username: true, password: true },
      });
    });

    it("throws UnauthorizedException when user is not found", async () => {
      findUniqueMock.mockResolvedValue(null);

      await expect(
        service.login({ username: "john", password: "pass" }),
      ).rejects.toBeInstanceOf(UnauthorizedException);

      expect(verifyPasswordMock).not.toHaveBeenCalled();
      expect(signAsyncMock).not.toHaveBeenCalled();
    });

    it("throws UnauthorizedException when password is invalid", async () => {
      findUniqueMock.mockResolvedValue({
        id: 1,
        username: "john",
        password: "hashed",
      });

      verifyPasswordMock.mockResolvedValue({ isValid: false });

      await expect(
        service.login({ username: "john", password: "wrong" }),
      ).rejects.toBeInstanceOf(UnauthorizedException);

      expect(verifyPasswordMock).toHaveBeenCalledWith("wrong", "hashed");
      expect(signAsyncMock).not.toHaveBeenCalled();
    });

    it("returns access_token when credentials are valid", async () => {
      findUniqueMock.mockResolvedValue({
        id: 7,
        username: "john",
        password: "hashed",
      });

      verifyPasswordMock.mockResolvedValue({ isValid: true });
      signAsyncMock.mockResolvedValue("jwt.token.value");

      const result = await service.login({
        username: "  JOHN ",
        password: "  pass123  ",
      });

      expect(findUniqueMock).toHaveBeenCalledWith({
        where: { username: "john" },
        select: { id: true, username: true, password: true },
      });

      expect(verifyPasswordMock).toHaveBeenCalledWith("pass123", "hashed");
      expect(signAsyncMock).toHaveBeenCalledWith({ sub: 7 });

      expect(result).toEqual({ access_token: "jwt.token.value" });
    });

    it("upgrades a legacy hash after successful verification", async () => {
      findUniqueMock.mockResolvedValue({
        id: 9,
        username: "john",
        password: "legacy-hash",
      });

      verifyPasswordMock.mockResolvedValue({
        isValid: true,
        upgradedHash: "bcrypt+hmac-sha256:v1$newhash",
      });
      signAsyncMock.mockResolvedValue("jwt.token.value");

      const result = await service.login({
        username: "john",
        password: "pass123",
      });

      expect(updateMock).toHaveBeenCalledWith({
        where: { id: 9 },
        data: { password: "bcrypt+hmac-sha256:v1$newhash" },
      });
      expect(result).toEqual({ access_token: "jwt.token.value" });
    });

    // ✅ NEW: covers "jwtService.signAsync throws" branch
    it("throws InternalServerErrorException when jwt signing fails", async () => {
      findUniqueMock.mockResolvedValue({
        id: 1,
        username: "john",
        password: "hashed",
      });

      verifyPasswordMock.mockResolvedValue({ isValid: true });
      signAsyncMock.mockRejectedValue(new Error("jwt fail"));

      await expect(
        service.login({ username: "john", password: "pass" }),
      ).rejects.toBeInstanceOf(InternalServerErrorException);

      await expect(
        service.login({ username: "john", password: "pass" }),
      ).rejects.toThrow("Login failed");
    });

    it("throws InternalServerErrorException on Prisma known request error", async () => {
      const prismaErr = new Prisma.PrismaClientKnownRequestError("boom", {
        code: "P2002",
        clientVersion: "test",
      });

      findUniqueMock.mockRejectedValue(prismaErr);

      await expect(
        service.login({ username: "john", password: "pass" }),
      ).rejects.toBeInstanceOf(InternalServerErrorException);
    });

    it("rethrows sanitized HttpExceptions from PasswordService unchanged", async () => {
      findUniqueMock.mockResolvedValue({
        id: 1,
        username: "john",
        password: "hashed",
      });

      verifyPasswordMock.mockRejectedValue(
        new InternalServerErrorException("Password processing failed"),
      );

      await expect(
        service.login({ username: "john", password: "pass" }),
      ).rejects.toThrow("Password processing failed");
    });

    it("throws InternalServerErrorException for unexpected errors", async () => {
      findUniqueMock.mockRejectedValue(new Error("random"));

      await expect(
        service.login({ username: "john", password: "pass" }),
      ).rejects.toBeInstanceOf(InternalServerErrorException);
    });
  });
});
