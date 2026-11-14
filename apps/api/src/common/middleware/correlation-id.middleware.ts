import { Injectable, NestMiddleware, Logger } from '@nestjs/common';
import { FastifyRequest, FastifyReply } from 'fastify';
import * as crypto from 'crypto';

declare module 'fastify' {
  interface FastifyRequest {
    correlationId?: string;
  }
}

@Injectable()
export class CorrelationIdMiddleware implements NestMiddleware {
  private readonly logger = new Logger('HTTP');

  use(req: any, res: any, next: () => void) {
    const rawReq = req.raw || req;
    const rawRes = res.raw || res;

    const incomingId =
      req.headers?.['x-correlation-id'] ||
      req.headers?.['x-request-id'] ||
      rawReq.headers?.['x-correlation-id'] ||
      rawReq.headers?.['x-request-id'];

    const correlationId = (typeof incomingId === 'string' && incomingId.trim()) || crypto.randomUUID();

    req.correlationId = correlationId;

    if (res.setHeader) {
      res.setHeader('x-correlation-id', correlationId);
    } else if (rawRes?.setHeader) {
      rawRes.setHeader('x-correlation-id', correlationId);
    }

    const start = Date.now();
    const method = req.method || rawReq.method;
    const url = req.originalUrl || req.url || rawReq.url;

    const onFinish = () => {
      const duration = Date.now() - start;
      const statusCode = res.statusCode || rawRes.statusCode || 200;

      // Safe structured log without any sensitive authorization headers or bodies
      this.logger.log(
        JSON.stringify({
          correlationId,
          method,
          url,
          statusCode,
          durationMs: duration,
        }),
      );
    };

    if (rawRes?.once) {
      rawRes.once('finish', onFinish);
    } else if (res.raw?.once) {
      res.raw.once('finish', onFinish);
    }

    next();
  }
}

