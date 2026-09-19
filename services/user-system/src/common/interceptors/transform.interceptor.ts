import {
  CallHandler,
  Injectable,
  NestInterceptor,
  type ExecutionContext,
} from '@nestjs/common';
import { map, type Observable } from 'rxjs';

@Injectable()
export class TransformInterceptor<T> implements NestInterceptor<T, { code: 0; data: T; message: string }> {
  intercept(_context: ExecutionContext, next: CallHandler<T>): Observable<{ code: 0; data: T; message: string }> {
    return next.handle().pipe(map((data) => ({ code: 0 as const, data, message: 'ok' })));
  }
}
