import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module";
import { StructuredExceptionFilter } from "./observability/structured-exception.filter";
import { StructuredLogger } from "./observability/structured-logger";
import {
  getApiCorsOrigins,
  getApiPort,
  validateRuntimeEnvironment,
} from "./runtime";

export async function createApiApp() {
  validateRuntimeEnvironment();
  const app = await NestFactory.create(AppModule);
  app.useLogger(new StructuredLogger());
  app.useGlobalFilters(new StructuredExceptionFilter());
  app.enableCors({
    origin: getApiCorsOrigins(),
    credentials: true,
    methods: ["GET", "HEAD", "POST", "PUT", "OPTIONS"],
    allowedHeaders: ["Accept", "Authorization", "Content-Type"],
  });
  return app;
}

async function bootstrap(): Promise<void> {
  const app = await createApiApp();
  await app.listen(getApiPort());
}

if (require.main === module) void bootstrap();
