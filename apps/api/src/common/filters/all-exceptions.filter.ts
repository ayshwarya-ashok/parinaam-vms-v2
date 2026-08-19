import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { QueryFailedError } from 'typeorm';
import { BusinessException } from '../exceptions/business.exception';

interface ErrorBody {
  statusCode: number;
  code: string;
  message: string;
  details?: unknown;
  traceId: string;
}

/**
 * Every error leaves the API in one shape:
 *   { statusCode, code, message, details, traceId }
 *
 * `code` is stable and the UI branches on it; `message` is human-facing and may
 * change without notice.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();
    const traceId = (request.headers['x-trace-id'] as string) ?? 'unknown';

    const body = this.toBody(exception, traceId);

    if (body.statusCode >= HttpStatus.INTERNAL_SERVER_ERROR) {
      this.logger.error(
        { traceId, path: request.url, err: exception },
        `Unhandled error: ${body.message}`,
      );
    }

    response.status(body.statusCode).json(body);
  }

  private toBody(exception: unknown, traceId: string): ErrorBody {
    if (exception instanceof BusinessException) {
      return {
        statusCode: exception.getStatus(),
        code: exception.code,
        message: exception.message,
        details: exception.details,
        traceId,
      };
    }

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const payload = exception.getResponse();
      const message =
        typeof payload === 'string'
          ? payload
          : ((payload as Record<string, unknown>).message as string) ?? exception.message;

      return {
        statusCode: status,
        code: this.httpCodeFor(status),
        message: Array.isArray(message) ? message.join('; ') : message,
        details: typeof payload === 'object' ? payload : undefined,
        traceId,
      };
    }

    // Surface database constraint violations as conflicts rather than 500s —
    // the check constraints in V001–V009 are business rules, not bugs.
    if (exception instanceof QueryFailedError) {
      const driver = exception.driverError as { code?: string; constraint?: string };
      if (driver?.code === '23505' || driver?.code === '23514') {
        return {
          statusCode: HttpStatus.CONFLICT,
          code: 'CONSTRAINT_VIOLATION',
          message: 'The request conflicts with an existing record or a business rule.',
          details: { constraint: driver.constraint },
          traceId,
        };
      }
    }

    return {
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      code: 'INTERNAL_ERROR',
      message: 'An unexpected error occurred.',
      traceId,
    };
  }

  private httpCodeFor(status: number): string {
    const map: Record<number, string> = {
      400: 'BAD_REQUEST',
      401: 'UNAUTHORIZED',
      403: 'FORBIDDEN',
      404: 'NOT_FOUND',
      409: 'CONFLICT',
      422: 'UNPROCESSABLE_ENTITY',
      423: 'ACCOUNT_LOCKED',
      429: 'RATE_LIMITED',
    };
    return map[status] ?? 'ERROR';
  }
}
