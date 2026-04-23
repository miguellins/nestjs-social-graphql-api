import { Injectable } from "@nestjs/common";

import { AsyncLocalStorage } from "async_hooks";

/** Request-scoped metadata carried through async execution without changing method signatures. */
export type RequestContextStore = {
  requestId: string;
  userId?: number;
  operationName?: string;
};

/** Provides access to request correlation metadata for HTTP and GraphQL flows. */
@Injectable()
export class RequestContextService {
  private readonly storage = new AsyncLocalStorage<RequestContextStore>();

  run<T>(context: RequestContextStore, callback: () => T): T {
    return this.storage.run(context, callback);
  }

  get<T extends keyof RequestContextStore>(
    key: T,
  ): RequestContextStore[T] | undefined {
    return this.storage.getStore()?.[key];
  }

  getStore(): RequestContextStore | undefined {
    return this.storage.getStore();
  }

  setRequestId(requestId: string): void {
    this.patchStore({ requestId });
  }

  setUserId(userId: number): void {
    this.patchStore({ userId });
  }

  setOperationName(operationName: string): void {
    this.patchStore({ operationName });
  }

  private patchStore(patch: Partial<RequestContextStore>): void {
    const store = this.storage.getStore();

    if (!store) return;

    Object.assign(store, patch);
  }
}
