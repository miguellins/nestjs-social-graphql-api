import { ArgumentsHost, HttpException, HttpStatus } from "@nestjs/common";

import { GqlArgumentsHost } from "@nestjs/graphql";

import { Prisma } from "@prisma/client";

import { GRAPHQL_ERROR_CODES } from "@/common/constants/graphql-error-code.constants";

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
      code: GRAPHQL_ERROR_CODES.DUPLICATE,
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
      code: GRAPHQL_ERROR_CODES.FOREIGN_KEY,
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
      code: GRAPHQL_ERROR_CODES.NOT_FOUND,
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
      code: GRAPHQL_ERROR_CODES.DB_ERROR,
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
      code: GRAPHQL_ERROR_CODES.UNAUTHENTICATED,
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

  it("maps HttpException conflict responses without explicit code to DUPLICATE", () => {
    const exception = new HttpException(
      "Username already exists",
      HttpStatus.CONFLICT,
    );

    const result = filter.catch(exception, {} as ArgumentsHost);

    expect(result.getStatus()).toBe(HttpStatus.CONFLICT);
    expect(result.getResponse()).toEqual({
      message: "Username already exists",
      code: GRAPHQL_ERROR_CODES.DUPLICATE,
      fields: undefined,
    });
  });

  it("sanitizes malformed fields from HttpException object responses", () => {
    const exception = new HttpException(
      {
        message: "Invalid input",
        code: GRAPHQL_ERROR_CODES.BAD_REQUEST,
        fields: ["email", 12, null],
      },
      HttpStatus.BAD_REQUEST,
    );

    const result = filter.catch(exception, {} as ArgumentsHost);

    expect(result.getStatus()).toBe(HttpStatus.BAD_REQUEST);
    expect(result.getResponse()).toEqual({
      message: "Invalid input",
      code: GRAPHQL_ERROR_CODES.BAD_REQUEST,
      fields: ["email"],
    });
  });

  it("maps unknown errors to INTERNAL_SERVER_ERROR", () => {
    const result = filter.catch(new Error("boom"), {} as ArgumentsHost);

    expect(result.getStatus()).toBe(HttpStatus.INTERNAL_SERVER_ERROR);
    expect(result.getResponse()).toEqual({
      message: "Internal server error",
      code: GRAPHQL_ERROR_CODES.INTERNAL_SERVER_ERROR,
    });
  });

  it("maps internal HttpException responses without explicit code to INTERNAL_SERVER_ERROR", () => {
    const exception = new HttpException(
      { message: "Server exploded" },
      HttpStatus.INTERNAL_SERVER_ERROR,
    );

    const result = filter.catch(exception, {} as ArgumentsHost);

    expect(result.getStatus()).toBe(HttpStatus.INTERNAL_SERVER_ERROR);
    expect(result.getResponse()).toEqual({
      message: "Server exploded",
      code: GRAPHQL_ERROR_CODES.INTERNAL_SERVER_ERROR,
      fields: undefined,
    });
  });
});
