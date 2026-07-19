// 路由 dispatcher
//
// 中间件链：corsMw → traceMw → errorBoundary → 路由
// 所有响应统一形如：
//   成功 { ok: true, data: ... }
//   失败 { ok: false, error: { code, message, trace_id } }
//
// 后续阶段的路由（auth/quota/interpret/redeem）在此 import 注册。

import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { setCookie } from 'hono/cookie';
import type { Env, AppVars } from './types';
import { ApiError, fail } from './errors';
import { login } from './auth';
import { authMw } from './middleware';
import { getQuota } from './quota';
import { interpret, legacyRoot } from './interpret';
import { redeem } from './redeem';
import { runCron } from './cron';
import { createWebSession, isAllowedWebOrigin, webSessionCookieOptions, WEB_SESSION_COOKIE } from './webAuth';

type AppEnv = { Bindings: Env; Variables: AppVars };

const app = new Hono<AppEnv>();

// ── CORS ──────────────────────────────────────────────
// 微信小程序 wx.request 不发 Origin（不是浏览器环境，无 CORS 概念），
// 因此无 Origin 时直接 return null（不写 ACAO 头，请求本身不受影响）。
// 浏览器调试场景才需要 ACAO，按白名单收紧；prod 不放 localhost。
app.use('*', cors({
  origin: (origin, c) => {
    if (!origin) return null;                                          // 小程序原生请求
    if (origin.endsWith('.servicewechat.com')) return origin;
    if (isAllowedWebOrigin(c.env, origin)) return origin;
    return null;
  },
  allowHeaders: ['Content-Type', 'Authorization', 'X-Session-Token'],
  allowMethods: ['GET', 'POST', 'OPTIONS'],
  credentials: true,
  maxAge: 86400,
}));

// ── traceId 注入 ──────────────────────────────────────
app.use('*', async (c, next) => {
  // CF request id 作为 trace；本地 dev fallback 到 random
  const cfRayId = c.req.header('cf-ray');
  const traceId = cfRayId || crypto.randomUUID();
  c.set('traceId', traceId);
  await next();
});

// ── 全局错误归一化 ────────────────────────────────────
app.onError((err, c) => {
  const traceId = c.get('traceId') ?? '';
  if (err instanceof ApiError) {
    return c.json({
      ok: false,
      error: { code: err.code, message: err.message, trace_id: traceId },
    }, err.status as any);
  }
  // 未预期：兜底 500
  // fail-safe：仅 ENV='dev' 显示详情；其余（含拼写漂移如 'production'）一律遮蔽
  console.error('[unhandled]', traceId, err);
  const showDetail = c.env.ENV === 'dev';
  return c.json({
    ok: false,
    error: {
      code: 'INTERNAL',
      message: showDetail ? String((err as any)?.message ?? err) : 'internal error',
      trace_id: traceId,
    },
  }, 500);
});

// ── 路由 ──────────────────────────────────────────────

// 健康检查（无 auth）
app.get('/health', (c) => {
  return c.json({
    ok: true,
    data: {
      env: c.env.ENV,
      time: Math.floor(Date.now() / 1000),
      legacy_root_fallback: c.env.LEGACY_ROOT_FALLBACK === 'true',
    },
  });
});

// POST /auth/login —— wx.login code → session token
app.post('/auth/login', async (c) => {
  let body: { code?: unknown };
  try {
    body = await c.req.json();
  } catch {
    fail('BAD_REQUEST', 'json body required');
  }
  const code = body!.code;
  if (typeof code !== 'string') fail('INVALID_CODE', 'code must be string');
  const result = await login(c.env, code as string);
  return c.json({ ok: true, data: result });
});

// POST /auth/web —— Turnstile → anonymous HttpOnly session
app.post('/auth/web', async (c) => {
  const origin = c.req.header('Origin');
  if (!isAllowedWebOrigin(c.env, origin)) fail('BAD_REQUEST', 'origin not allowed');
  let body: { turnstile_token?: unknown };
  try { body = await c.req.json(); } catch { fail('BAD_REQUEST', 'json body required'); }
  if (typeof body!.turnstile_token !== 'string') fail('BAD_REQUEST', 'turnstile_token required');
  const ip = c.req.header('cf-connecting-ip') || 'unknown';
  const { login: session, quota } = await createWebSession(c.env, body!.turnstile_token, ip);
  setCookie(c, WEB_SESSION_COOKIE, session.token, webSessionCookieOptions(c.env, session.expires_at));
  return c.json({
    ok: true,
    data: {
      expires_at: session.expires_at,
      quota: {
        daily_remaining: quota.daily_remaining,
        daily_reset_date: quota.daily_reset_date,
        permanent_balance: quota.permanent_balance,
        unlimited_until: quota.unlimited_until,
        total_consumed: quota.total_consumed,
      },
    },
  });
});

// GET /quota —— 当前三档 quota
app.get('/quota', authMw, async (c) => {
  const sess = c.get('session')!;
  const row = await getQuota(c.env, sess.userId);
  return c.json({
    ok: true,
    data: {
      daily_remaining:   row.daily_remaining,
      daily_reset_date:  row.daily_reset_date,
      permanent_balance: row.permanent_balance,
      unlimited_until:   row.unlimited_until,
      total_consumed:    row.total_consumed,
    },
  });
});

// POST /interpret —— quota check → DeepSeek 透传 → 失败 refund
app.post('/interpret', authMw, async (c) => {
  const sess = c.get('session')!;
  const traceId = c.get('traceId')!;
  let body: unknown;
  try { body = await c.req.json(); } catch { fail('BAD_REQUEST', 'json body required'); }
  const result = await interpret(c.env, sess.userId, body, traceId);
  return c.json({ ok: true, data: result });
});

// POST / —— 灰度期 DeepSeek 直透传（无 auth）；切 LEGACY_ROOT_FALLBACK='false' 即 410 Gone
app.post('/', async (c) => {
  const traceId = c.get('traceId')!;
  // cf-connecting-ip 来自 CF 边缘可信；x-real-ip 等头部客户端可伪造，不接受
  const ip = c.req.header('cf-connecting-ip') || 'unknown';
  let body: unknown;
  try { body = await c.req.json(); } catch { fail('BAD_REQUEST', 'json body required'); }
  const result = await legacyRoot(c.env, body, ip, traceId);
  // legacy 路径返回字段同形于 DeepSeek 原响应（无 ok envelope，保持向后兼容）
  return c.json(result);
});

// POST /redeem —— 卡密兑换（HMAC 先于 DB）
app.post('/redeem', authMw, async (c) => {
  const sess = c.get('session')!;
  let body: { code?: unknown };
  try { body = await c.req.json(); } catch { fail('BAD_REQUEST', 'json body required'); }
  const result = await redeem(c.env, sess.userId, body!.code);
  return c.json({ ok: true, data: result });
});

// 404 兜底
app.notFound((c) => {
  return c.json({
    ok: false,
    error: {
      code: 'NOT_FOUND',
      message: `route ${c.req.method} ${c.req.path} not found`,
      trace_id: c.get('traceId') ?? '',
    },
  }, 404);
});

// ── Worker 完整 export ────────────────────────────────
// Hono app 提供 fetch 处理，scheduled 处理 cron 触发器。
export default {
  fetch: app.fetch,
  async scheduled(_event: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
    ctx.waitUntil(runCron({ env }));
  },
};
