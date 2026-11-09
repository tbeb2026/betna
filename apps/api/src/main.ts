import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { BadRequestException, ValidationPipe, type Type } from "@nestjs/common";
import { AppModule } from "./app.module";
import { StructuredExceptionFilter } from "./observability/structured-exception.filter";
import { StructuredLogger } from "./observability/structured-logger";
import {
  API_CORS_METHODS,
  getApiCorsOrigins,
  getApiPort,
  validateRuntimeEnvironment,
} from "./runtime";

export class StrictBodyValidationPipe extends ValidationPipe {
  override async transform(value: unknown, metadata: Parameters<ValidationPipe["transform"]>[1]) {
    if (metadata.type === "body" && (value === null || Array.isArray(value))) {
      throw new BadRequestException("Request body must be an object");
    }
    return super.transform(value, metadata);
  }
}

export async function createApiApp(appModule: Type = AppModule) {
  validateRuntimeEnvironment();
  const app = await NestFactory.create(appModule);
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
