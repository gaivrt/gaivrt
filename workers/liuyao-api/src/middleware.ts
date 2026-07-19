// 中间件：authMw + （未来）rateLimit
//
// authMw：从 Authorization: Bearer <token> 或 X-Session-Token 取 token，
// 调 verifyToken → c.set('session', ctx) 或抛 401。

import type { MiddlewareHandler } from 'hono';
import { getCookie } from 'hono/cookie';
import type { Env, AppVars } from './types';
import { ApiError } from './errors';
import { verifyToken } from './auth';
import { isAllowedWebOrigin, WEB_SESSION_COOKIE } from './webAuth';

type AppEnv = { Bindings: Env; Variables: AppVars };

function extractToken(authz: string | undefined, xToken: string | undefined): string | null {
  if (xToken) return xToken.trim();
  if (authz) {
    const m = authz.match(/^Bearer\s+(\S+)$/i);
    if (m) return m[1];
  }
  return null;
}

export const authMw: MiddlewareHandler<AppEnv> = async (c, next) => {
  const headerToken = extractToken(c.req.header('Authorization'), c.req.header('X-Session-Token'));
  const cookieToken = getCookie(c, WEB_SESSION_COOKIE);
  if (cookieToken && !headerToken && !isAllowedWebOrigin(c.env, c.req.header('Origin'))) {
    throw new ApiError(403, 'ORIGIN_REJECTED', 'web session origin rejected');
  }
  const token = headerToken || cookieToken || null;
  if (!token) {
    throw new ApiError(401, 'UNAUTHENTICATED', 'session token missing');
  }
  const ctx = await verifyToken(c.env, token);
  if (!ctx) {
    throw new ApiError(401, 'UNAUTHENTICATED', 'session invalid or expired');
  }
  c.set('session', ctx);
  await next();
};
