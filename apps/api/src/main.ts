import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { BadRequestException, ValidationPipe, type Type } from "@nestjs/common";
import type { NestExpressApplication } from "@nestjs/platform-express";
import type { RequestHandler } from "express";
import { AppModule } from "./app.module";
import { StructuredExceptionFilter } from "./observability/structured-exception.filter";
import { StructuredLogger } from "./observability/structured-logger";
import {
  API_CORS_METHODS,
  getApiCorsOrigins,
  getApiPort,
  validateRuntimeEnvironment,
} from "./runtime";

const MISSING_BODY = Symbol("betna.missingBody");

export class StrictBodyValidationPipe extends ValidationPipe {
  override async transform(value: unknown, metadata: Parameters<ValidationPipe["transform"]>[1]) {
    if (metadata.type === "body" && (!isPlainObject(value) || isMissingBody(value))) {
      throw new BadRequestException("Request body must be an object");
    }
    return super.transform(value, metadata);
  }
}

function isPlainObject(value: unknown): value is Record<PropertyKey, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function isMissingBody(value: Record<PropertyKey, unknown>): boolean {
  return value[MISSING_BODY] === true;
}

const markMissingBody: RequestHandler = (request, _response, next) => {
  const contentLength = request.headers["content-length"];
  const hasNoBody = contentLength === "0" || (contentLength === undefined && request.headers["transfer-encoding"] === undefined);
  if (hasNoBody && isPlainObject(request.body)) {
    Object.defineProperty(request.body, MISSING_BODY, { value: true });
  }
  next();
};

export async function createApiApp(appModule: Type = AppModule) {
  validateRuntimeEnvironment();
  const app = await NestFactory.create<NestExpressApplication>(appModule, { bodyParser: false });
  app.useBodyParser("json", { strict: false });
  app.useBodyParser("urlencoded", { extended: true });
  app.use(markMissingBody);
  app.useLogger(new StructuredLogger());
  app.useGlobalFilters(new StructuredExceptionFilter());
  app.useGlobalPipes(
    new StrictBodyValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true,
      transformOptions: { enableImplicitConversion: false },
    }),
  );
  app.enableCors({
    origin: getApiCorsOrigins(),
    credentials: true,
    methods: [...API_CORS_METHODS],
    allowedHeaders: ["Accept", "Authorization", "Content-Type"],
  });
  return app;
}

async function bootstrap(): Promise<void> {
  const app = await createApiApp();
  await app.listen(getApiPort());
}

if (require.main === module) void bootstrap();
