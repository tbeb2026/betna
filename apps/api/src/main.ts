import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module";
import { getApiCorsOrigins, getApiPort } from "./runtime";

export async function createApiApp() {
  const app = await NestFactory.create(AppModule);
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
