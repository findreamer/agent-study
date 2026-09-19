import {
  ArgumentsHost,
  Catch,
  HttpException,
  type ExceptionFilter,
} from '@nestjs/common';
import type { Response } from 'express';

type ExceptionBody = string | { message?: unknown; issues?: unknown };

@Catch(HttpException)
export class HttpExceptionFilter implements ExceptionFilter {
  catch(exception: HttpException, host: ArgumentsHost) {
    const response = host.switchToHttp().getResponse<Response>();
    const status = exception.getStatus();
    const body = exception.getResponse() as ExceptionBody;

    const payload: { code: number; message: string; issues?: unknown } = {
      code: status,
      message:
        typeof body === 'string'
          ? body
          : typeof body?.message === 'string'
            ? body.message
            : HttpException.name,
    };
    if (typeof body === 'object' && body?.issues) {
      payload.issues = body.issues;
    }
    response.status(status).json(payload);
  }
}
