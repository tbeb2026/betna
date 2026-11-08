import { Controller, Get, HttpStatus, Res } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";

type HealthResponse = {
  status: "ok" | "degraded";
  service: "api";
  timestamp: string;
  checks?: { database: "up" | "down" };
};

type StatusResponse = { status: (code: number) => StatusResponse };

@Controller("health")
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  @Get("live")
  live(): HealthResponse {
    return {
      status: "ok",
      service: "api",
      timestamp: new Date().toISOString(),
    };
  }

  @Get()
  ready(
    @Res({ passthrough: true }) response: StatusResponse,
  ): Promise<HealthResponse> {
    return this.checkDatabase(response);
  }

  @Get("ready")
  readyProbe(
    @Res({ passthrough: true }) response: StatusResponse,
  ): Promise<HealthResponse> {
    return this.checkDatabase(response);
  }

  private async checkDatabase(
    response: StatusResponse,
  ): Promise<HealthResponse> {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      response.status(HttpStatus.OK);
      return {
        status: "ok",
        service: "api",
        timestamp: new Date().toISOString(),
        checks: { database: "up" },
      };
    } catch {
      response.status(HttpStatus.SERVICE_UNAVAILABLE);
      return {
        status: "degraded",
        service: "api",
        timestamp: new Date().toISOString(),
        checks: { database: "down" },
      };
    }
  }
}
