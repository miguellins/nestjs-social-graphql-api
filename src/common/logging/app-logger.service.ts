import { ConsoleLogger, Injectable, type LogLevel } from "@nestjs/common";

import { RequestContextService } from "@/common/request-context/request-context.service";

type StructuredLogLevel =
  | "debug"
  | "error"
  | "fatal"
  | "info"
  | "verbose"
  | "warn";

type StructuredLogEntry = {
  level: StructuredLogLevel;
  timestamp: string;
  message: string;
  requestId?: string;
  operationName?: string;
  userId?: number;
  path?: string;
  method?: string;
  service?: string;
  errorName?: string;
  stack?: string;
};

type ParsedLogData = {
  context?: string;
  stack?: string;
  path?: string;
  method?: string;
  errorName?: string;
};

/** Emits request-aware structured logs while preserving Nest Logger compatibility. */
@Injectable()
export class AppLoggerService extends ConsoleLogger {
  private readonly isProduction = process.env.NODE_ENV === "production";

  constructor(private readonly requestContextService: RequestContextService) {
    super();
    this.setLogLevels(["debug", "error", "fatal", "log", "verbose", "warn"]);
  }

  override log(message: unknown, ...optionalParams: unknown[]): void {
    this.write("info", message, this.parseStandardParams(optionalParams));
  }

  override error(message: unknown, ...optionalParams: unknown[]): void {
    this.write("error", message, this.parseErrorParams(optionalParams));
  }

  override warn(message: unknown, ...optionalParams: unknown[]): void {
    this.write("warn", message, this.parseStandardParams(optionalParams));
  }

  override debug(message: unknown, ...optionalParams: unknown[]): void {
    this.write("debug", message, this.parseStandardParams(optionalParams));
  }

  override verbose(message: unknown, ...optionalParams: unknown[]): void {
    this.write("verbose", message, this.parseStandardParams(optionalParams));
  }

  override fatal(message: unknown, ...optionalParams: unknown[]): void {
    this.write("fatal", message, this.parseErrorParams(optionalParams));
  }

  override setLogLevels(levels: LogLevel[]): void {
    super.setLogLevels(levels);
  }

  private write(
    level: StructuredLogLevel,
    message: unknown,
    parsed: ParsedLogData,
  ): void {
    const entry = this.createEntry(level, message, parsed);
    const serialized = this.isProduction
      ? JSON.stringify(entry)
      : this.formatPretty(entry);
    const writer =
      level === "error" || level === "fatal" ? process.stderr : process.stdout;

    writer.write(`${serialized}\n`);
  }

  private createEntry(
    level: StructuredLogLevel,
    message: unknown,
    parsed: ParsedLogData,
  ): StructuredLogEntry {
    const now = new Date().toISOString();
    const context = this.requestContextService.getStore();
    const normalizedMessage =
      message instanceof Error ? message.message : String(message);
    const errorName =
      parsed.errorName ?? (message instanceof Error ? message.name : undefined);
    const stack =
      parsed.stack ?? (message instanceof Error ? message.stack : undefined);

    return {
      level,
      timestamp: now,
      message: normalizedMessage,
      requestId: context?.requestId,
      operationName: context?.operationName,
      userId: context?.userId,
      path: parsed.path,
      method: parsed.method,
      service: parsed.context,
      errorName,
      stack,
    };
  }

  private formatPretty(entry: StructuredLogEntry): string {
    const extras = [
      entry.service ? `[${entry.service}]` : undefined,
      entry.requestId ? `requestId=${entry.requestId}` : undefined,
      entry.userId !== undefined ? `userId=${entry.userId}` : undefined,
      entry.operationName ? `operationName=${entry.operationName}` : undefined,
      entry.method ? `method=${entry.method}` : undefined,
      entry.path ? `path=${entry.path}` : undefined,
      entry.errorName ? `errorName=${entry.errorName}` : undefined,
    ]
      .filter((value): value is string => Boolean(value))
      .join(" ");

    const base = `[${entry.timestamp}] ${entry.level.toUpperCase()} ${entry.message}`;

    if (!entry.stack) {
      return extras ? `${base} ${extras}` : base;
    }

    return extras
      ? `${base} ${extras}\n${entry.stack}`
      : `${base}\n${entry.stack}`;
  }

  private parseStandardParams(optionalParams: unknown[]): ParsedLogData {
    const context = this.findTrailingContext(optionalParams);
    const metadata = this.findMetadata(optionalParams);

    return {
      context,
      path: metadata?.path,
      method: metadata?.method,
      errorName: metadata?.errorName,
    };
  }

  private parseErrorParams(optionalParams: unknown[]): ParsedLogData {
    const context = this.findTrailingContext(optionalParams);
    const metadata = this.findMetadata(optionalParams);
    const stackCandidate =
      optionalParams.length > 0 && typeof optionalParams[0] === "string"
        ? optionalParams[0]
        : undefined;

    return {
      context,
      stack: stackCandidate,
      path: metadata?.path,
      method: metadata?.method,
      errorName: metadata?.errorName,
    };
  }

  private findTrailingContext(optionalParams: unknown[]): string | undefined {
    const trailing = optionalParams.at(-1);
    return typeof trailing === "string" ? trailing : undefined;
  }

  private findMetadata(
    optionalParams: unknown[],
  ): { errorName?: string; method?: string; path?: string } | undefined {
    for (const param of optionalParams) {
      if (!isStructuredLogMetadata(param)) continue;
      return {
        errorName:
          typeof param.errorName === "string" ? param.errorName : undefined,
        method: typeof param.method === "string" ? param.method : undefined,
        path: typeof param.path === "string" ? param.path : undefined,
      };
    }

    return undefined;
  }
}

function isStructuredLogMetadata(
  value: unknown,
): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
