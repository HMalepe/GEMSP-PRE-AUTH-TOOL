import type { NextFunction, Request, RequestHandler, Response } from 'express';

/**
 * Encryption in transit (Technical Build Spec §7). This process itself
 * speaks plain HTTP — Node's `http` module doesn't do TLS termination in
 * this deployment shape, and shouldn't have to: a real deployment sits
 * this service behind a TLS-terminating reverse proxy/load balancer (see
 * docs/runbook.md). What this middleware CAN do, and does when
 * `REQUIRE_TLS=true`, is refuse any request that reaches it without proof
 * the edge terminated TLS — trusting `X-Forwarded-Proto` only because the
 * proxy in front is assumed to strip/overwrite any client-supplied value
 * for that header before this process ever sees it (standard reverse-
 * proxy hardening, out of this application's control to enforce itself).
 */
export function requireHttps(): RequestHandler {
  return (req: Request, res: Response, next: NextFunction) => {
    if (req.secure || req.header('x-forwarded-proto') === 'https') {
      next();
      return;
    }
    res.status(403).json({ error: 'HTTPS is required — this request arrived without TLS' });
  };
}
