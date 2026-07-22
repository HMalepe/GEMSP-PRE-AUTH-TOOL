import crypto from 'node:crypto';
import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { logger } from './logger.js';

/**
 * Every request gets a UUID, echoed back as `x-request-id` and logged
 * against method/path/status/duration on completion (Technical Build Spec
 * §6 Observability). Attached to `req` so downstream handlers/audit-log
 * writes can correlate an access-log entry with the HTTP request that
 * produced it.
 */
export interface RequestWithId extends Request {
  requestId: string;
}

export function requestLogger(): RequestHandler {
  return (req: Request, res: Response, next: NextFunction) => {
    const requestId = crypto.randomUUID();
    (req as RequestWithId).requestId = requestId;
    res.setHeader('x-request-id', requestId);

    const startedAt = process.hrtime.bigint();
    res.on('finish', () => {
      const durationMs = Number(process.hrtime.bigint() - startedAt) / 1_000_000;
      logger.info('http_request', {
        requestId,
        method: req.method,
        path: req.path,
        status: res.statusCode,
        durationMs: Math.round(durationMs * 100) / 100,
      });
    });

    next();
  };
}
