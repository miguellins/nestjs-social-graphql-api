import { Injectable, NestMiddleware } from "@nestjs/common";

import { randomUUID } from "crypto";

import { RequestContextService } from "@/common/request-context/request-context.service";

import type { NextFunction, Request, Response } from "express";

export const REQUEST_ID_HEADER = "x-request-id";

type RequestWithContext = Request & {
  requestId?: string;
};

/** Creates or preserves the request id and initializes AsyncLocalStorage for the request. */
@Injectable()
export class RequestContextMiddleware implements NestMiddleware {
  constructor(private readonly requestContextService: RequestContextService) {}

  use(req: RequestWithContext, res: Response, next: NextFunction): void {
    const requestId = this.resolveRequestId(req.headers[REQUEST_ID_HEADER]);

    req.requestId = requestId;
    res.setHeader(REQUEST_ID_HEADER, requestId);

    this.requestContextService.run({ requestId }, next);
  }

  private resolveRequestId(headerValue: string | string[] | undefined): string {
    if (typeof headerValue === "string" && headerValue.trim().length > 0) {
      return headerValue.trim();
    }

    if (Array.isArray(headerValue)) {
      const firstValue = headerValue.find(
        (value) => typeof value === "string" && value.trim().length > 0,
      );

      if (firstValue) {
        return firstValue.trim();
      }
    }

    return randomUUID();
  }
}
