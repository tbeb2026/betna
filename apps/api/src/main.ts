import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module";
import { getApiPort } from "./runtime";

export async function createApiApp() {
  return NestFactory.create(AppModule);
}

async function bootstrap(): Promise<void> {
  const app = await createApiApp();
  await app.listen(getApiPort());
}

if (require.main === module) void bootstrap();
