import { ArgumentsHost, HttpException, HttpStatus } from "@nestjs/common";

import { GqlArgumentsHost } from "@nestjs/graphql";

import { Prisma } from "@prisma/client";

import { GlobalGqlExceptionFilter } from "./gql-exception.filter";

describe("GlobalGqlExceptionFilter", () => {
  let filter: GlobalGqlExceptionFilter;

  beforeEach(() => {
    filter = new GlobalGqlExceptionFilter();
    jest
      .spyOn(GqlArgumentsHost, "create")
      .mockReturnValue({} as GqlArgumentsHost);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("maps Prisma P2002 to CONFLICT with fields", () => {
    const exception = new Prisma.PrismaClientKnownRequestError("dup", {
      code: "P2002",
      clientVersion: "test",
      meta: { target: ["email"] },
    });

    const result = filter.catch(exception, {} as ArgumentsHost);

    expect(result).toBeInstanceOf(HttpException);
    expect(result.getStatus()).toBe(HttpStatus.CONFLICT);
    expect(result.getResponse()).toEqual({
      message: "Already exists: email",
      code: "DUPLICATE",
      fields: ["email"],
    });
  });

  it("maps Prisma P2003 to BAD_REQUEST", () => {
    const exception = new Prisma.PrismaClientKnownRequestError("fk", {
      code: "P2003",
      clientVersion: "test",
    });

    const result = filter.catch(exception, {} as ArgumentsHost);

    expect(result.getStatus()).toBe(HttpStatus.BAD_REQUEST);
    expect(result.getResponse()).toEqual({
      message: "Invalid reference",
      code: "FOREIGN_KEY",
    });
  });

  it("maps Prisma P2025 to NOT_FOUND", () => {
    const exception = new Prisma.PrismaClientKnownRequestError("missing", {
      code: "P2025",
      clientVersion: "test",
    });

    const result = filter.catch(exception, {} as ArgumentsHost);

    expect(result.getStatus()).toBe(HttpStatus.NOT_FOUND);
    expect(result.getResponse()).toEqual({
      message: "Not found",
      code: "NOT_FOUND",
    });
  });

  it("maps unknown Prisma error to DB_ERROR", () => {
    const exception = new Prisma.PrismaClientKnownRequestError("db", {
      code: "P9999",
      clientVersion: "test",
    });

    const result = filter.catch(exception, {} as ArgumentsHost);

    expect(result.getStatus()).toBe(HttpStatus.BAD_REQUEST);
    expect(result.getResponse()).toEqual({
      message: "Database error",
      code: "DB_ERROR",
    });
  });

  it("normalizes HttpException with string response", () => {
    const exception = new HttpException(
      "Auth required",
      HttpStatus.UNAUTHORIZED,
    );

    const result = filter.catch(exception, {} as ArgumentsHost);

    expect(result.getStatus()).toBe(HttpStatus.UNAUTHORIZED);
    expect(result.getResponse()).toEqual({
      message: "Auth required",
      code: "UNAUTHENTICATED",
      fields: undefined,
    });
  });

  it("keeps explicit code/fields from HttpException object response", () => {
    const exception = new HttpException(
      { message: ["First", "Second"], code: "CUSTOM", fields: ["email"] },
      HttpStatus.BAD_REQUEST,
    );

    const result = filter.catch(exception, {} as ArgumentsHost);

    expect(result.getStatus()).toBe(HttpStatus.BAD_REQUEST);
    expect(result.getResponse()).toEqual({
      message: "First",
      code: "CUSTOM",
      fields: ["email"],
    });
  });

  it("maps unknown errors to INTERNAL_SERVER_ERROR", () => {
    const result = filter.catch(new Error("boom"), {} as ArgumentsHost);

    expect(result.getStatus()).toBe(HttpStatus.INTERNAL_SERVER_ERROR);
    expect(result.getResponse()).toEqual({
      message: "Internal server error",
      code: "INTERNAL_SERVER_ERROR",
    });
  });
});
