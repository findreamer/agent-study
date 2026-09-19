import { Injectable } from '@nestjs/common';
import pino from 'pino';

export interface AuditInput {
  event: string;
  actorId?: string;
  targetType?: string;
  targetId?: string;
  before?: unknown;
  after?: unknown;
  ip?: string;
  ua?: string;
}

@Injectable()
export class AuditService {
  private readonly logger = pino({ base: { service: 'user-system', stream: 'audit' } });

  log(input: AuditInput): void {
    this.logger.info({ audit: input }, input.event);
  }
}
