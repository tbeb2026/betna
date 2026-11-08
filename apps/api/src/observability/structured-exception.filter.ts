import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
} from "@nestjs/common";
import { StructuredLogger } from "./structured-logger";
import { redactLogValue } from "./structured-logger";

@Catch()
export class StructuredExceptionFilter implements ExceptionFilter {
  private readonly logger = new StructuredLogger();

  catch(exception: unknown, host: ArgumentsHost): void {
    const context = host.switchToHttp();
    const response = context.getResponse<{
      status: (code: number) => { json: (body: unknown) => void };
    }>();
    const request = context.getRequest<{
      method?: string;
      originalUrl?: string;
      url?: string;
    }>();
    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;
    const body =
      exception instanceof HttpException ? exception.getResponse() : undefined;
    const message = status >= 500 ? "Internal server error" : body;
    const rawPath = request.originalUrl ?? request.url ?? "/";
    const path = rawPath.split(/[?#]/, 1)[0] || "/";

    this.logger.error(
      {
        event: "http.request.error",
        status,
        method: request.method,
        path,
        error:
          redactLogValue(
            exception instanceof Error ? exception.message : String(exception),
          ),
      },
      exception instanceof Error ? exception.stack : undefined,
      "HttpException",
    );
    response.status(status).json({
      statusCode: status,
      message,
      timestamp: new Date().toISOString(),
      path,
    });
  }
}
