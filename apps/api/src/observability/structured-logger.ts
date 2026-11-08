import { LoggerService } from "@nestjs/common";

type Level = "info" | "warn" | "error" | "debug" | "verbose" | "fatal";

const sensitiveKey = /(authorization|cookie|password|passphrase|secret|token|api[-_]?key|credential|body)/i;
const urlPattern = /\b(?:https?|postgres(?:ql)?|redis):\/\/[^\s"']+/gi;

/** Keep operational logs useful without retaining credentials, request URLs, or payloads. */
export function redactLogValue(value: unknown, key?: string): unknown {
  if (key && sensitiveKey.test(key)) return "[REDACTED]";
  if (typeof value === "string") {
    const withoutQuery = value.startsWith("/") ? value.split(/[?#]/, 1)[0] : value;
    return withoutQuery.replace(urlPattern, "[REDACTED_URL]");
  }
  if (value instanceof Error) return redactLogValue(value.stack ?? value.message);
  if (Array.isArray(value)) return value.map((entry) => redactLogValue(entry));
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([entryKey, entryValue]) => [
        entryKey,
        redactLogValue(entryValue, entryKey),
      ]),
    );
  }
  return value;
}

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
      message:
        typeof message === "string"
          ? redactLogValue(message)
          : JSON.stringify(redactLogValue(message)),
    };
    if (context) entry.context = context;
    if (trace) entry.trace = redactLogValue(trace);
    const line = JSON.stringify(entry);
    if (level === "error" || level === "fatal") console.error(line);
    else if (level === "warn") console.warn(line);
    else console.log(line);
  }
}
