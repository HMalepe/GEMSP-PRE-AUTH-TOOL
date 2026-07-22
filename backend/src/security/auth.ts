import type { NextFunction, Request, RequestHandler, Response } from 'express';
import type { Pool } from 'pg';
import { isRole, type Role } from './roles.js';

export interface AuthenticatedUser {
  userId: string;
  name: string;
  role: Role;
}

export interface AuthenticatedRequest extends Request {
  user?: AuthenticatedUser;
}

/**
 * Authenticates every request against `app_user` via the `X-User-Id`
 * header (Technical Build Spec §7: "named accounts, no shared logins").
 *
 * This is deliberately NOT a full SSO/credential system — same documented
 * stopgap pattern as the front-end's useCurrentUser() hook. In production
 * a reverse proxy in front of this service must terminate real
 * authentication (SSO/mTLS/etc.) and be the thing that injects a
 * trustworthy identity header; this middleware's job is only to turn that
 * already-authenticated identity into an enforced role, and to refuse a
 * request that has no identity or names an unknown/inactive account. See
 * docs/runbook.md for what a real deployment must add in front of this.
 */
export function authenticate(pool: Pool): RequestHandler {
  return async (req: Request, res: Response, next: NextFunction) => {
    const userId = req.header('x-user-id');
    if (!userId) {
      res.status(401).json({ error: 'X-User-Id header is required' });
      return;
    }

    try {
      const { rows } = await pool.query<{ user_id: string; name: string; role: string; active: boolean }>(
        'SELECT user_id, name, role, active FROM app_user WHERE user_id = $1',
        [userId],
      );
      const row = rows[0];
      if (!row || !row.active || !isRole(row.role)) {
        res.status(401).json({ error: 'unknown or inactive user' });
        return;
      }
      (req as AuthenticatedRequest).user = { userId: row.user_id, name: row.name, role: row.role };
      next();
    } catch (err) {
      next(err);
    }
  };
}

/** 401 if unauthenticated (should be unreachable behind `authenticate`), 403 if the authenticated role isn't in `roles`. */
export function requireRole(...roles: Role[]): RequestHandler {
  const allowed = new Set(roles);
  return (req: Request, res: Response, next: NextFunction) => {
    const user = (req as AuthenticatedRequest).user;
    if (!user) {
      res.status(401).json({ error: 'not authenticated' });
      return;
    }
    if (!allowed.has(user.role)) {
      res.status(403).json({ error: `role '${user.role}' is not permitted to perform this action` });
      return;
    }
    next();
  };
}
