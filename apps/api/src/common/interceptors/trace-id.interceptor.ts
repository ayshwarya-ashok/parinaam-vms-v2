import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { Request, Response } from 'express';
import type { Observable } from 'rxjs';

/**
 * Stamps every request with a trace id, echoes it on the response, and makes it
 * available to the exception filter so a user-visible error can be matched to a
 * log line.
 */
@Injectable()
export class TraceIdInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const http = context.switchToHttp();
    const request = http.getRequest<Request>();
    const response = http.getResponse<Response>();

    const traceId = (request.headers['x-trace-id'] as string) || randomUUID();
    request.headers['x-trace-id'] = traceId;
    response.setHeader('X-Trace-Id', traceId);

    return next.handle();
  }
}
