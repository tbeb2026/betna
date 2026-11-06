import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module";

export async function createApiApp() {
  return NestFactory.create(AppModule);
}

async function bootstrap(): Promise<void> {
  const app = await createApiApp();
  await app.listen(process.env.PORT ?? 3001);
}

if (require.main === module) void bootstrap();
