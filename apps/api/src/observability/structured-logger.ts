import { LoggerService } from "@nestjs/common";

type Level = "info" | "warn" | "error" | "debug" | "verbose" | "fatal";

/** Emits one JSON object per log line so platform log drains can index it. */
export class StructuredLogger implements LoggerService {
  log(message: unknown, context?: string): void {
    this.write("info", message, context);
  }

  warn(message: unknown, context?: string): void {
    this.write("warn", message, context);
  }

  error(message: unknown, trace?: string, context?: string): void {
    this.write("error", message, context, trace);
  }

  debug(message: unknown, context?: string): void {
    this.write("debug", message, context);
  }

  verbose(message: unknown, context?: string): void {
    this.write("verbose", message, context);
  }

  fatal(message: unknown, context?: string): void {
    this.write("fatal", message, context);
  }

  private write(
    level: Level,
    message: unknown,
    context?: string,
    trace?: string,
  ): void {
    const entry: Record<string, unknown> = {
      timestamp: new Date().toISOString(),
      level,
      service: "betna-api",
      message: typeof message === "string" ? message : JSON.stringify(message),
    };
    if (context) entry.context = context;
    if (trace) entry.trace = trace;
    const line = JSON.stringify(entry);
    if (level === "error" || level === "fatal") console.error(line);
    else if (level === "warn") console.warn(line);
    else console.log(line);
  }
}
