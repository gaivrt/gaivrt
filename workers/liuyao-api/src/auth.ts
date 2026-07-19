// /auth/login · wx.login code → openid → session token
//
// 流程：
//   1. 解析 body.code，空 → 400 INVALID_CODE
//   2. WX_MOCK=1 时跳过 jscode2session（dev 用，伪造 openid）
//   3. 否则 fetch https://api.weixin.qq.com/sns/jscode2session
//      失败 / errcode != 0 → 502 WX_API_FAIL
//   4. upsertUser → ensureQuotaRow
//   5. 生成 token = hex(HMAC_SHA256(SESSION_HMAC_SECRET, "<uid>.<rand>.<now>"))
//   6. INSERT sessions (expires_at = now + 30d)
//   7. 返回 {token, expires_at, user_id}

import type { Env, SessionCtx } from './types';
import { ApiError, fail } from './errors';
import {
  upsertUser, getSessionByToken, nowSec,
  prepareEnsureQuotaRow, prepareCreateSession,
} from './db';

const SESSION_TTL_SEC = 30 * 24 * 3600;

interface WxJscode2SessionResp {
  openid?: string;
  unionid?: string;
  session_key?: string;
  errcode?: number;
  errmsg?: string;
}

async function callJscode2Session(env: Env, code: string): Promise<WxJscode2SessionResp> {
  const url = new URL('https://api.weixin.qq.com/sns/jscode2session');
  url.searchParams.set('appid', env.WX_APPID);
  url.searchParams.set('secret', env.WX_APPSECRET);
  url.searchParams.set('js_code', code);
  url.searchParams.set('grant_type', 'authorization_code');

  let res: Response;
  try {
    res = await fetch(url.toString(), { method: 'GET' });
  } catch (e) {
    throw new ApiError(502, 'WX_API_FAIL', `wx fetch failed: ${(e as Error).message}`);
  }
  if (!res.ok) {
    throw new ApiError(502, 'WX_API_FAIL', `wx http ${res.status}`);
  }
  let data: WxJscode2SessionResp;
  try {
    data = await res.json();
  } catch {
    throw new ApiError(502, 'WX_API_FAIL', 'wx response not json');
  }
  return data;
}

/**
 * Hex-encode an ArrayBuffer or Uint8Array.
 */
function toHex(buf: ArrayBuffer | Uint8Array): string {
  const arr = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let hex = '';
  for (let i = 0; i < arr.length; i++) {
    hex += arr[i].toString(16).padStart(2, '0');
  }
  return hex;
}

async function makeSessionToken(env: Env, userId: number): Promise<string> {
  // 16 字节随机
  const rand = new Uint8Array(16);
  crypto.getRandomValues(rand);
  const randHex = toHex(rand);

  const msg = `${userId}.${randHex}.${nowSec()}`;
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(env.SESSION_HMAC_SECRET),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(msg));
  return toHex(sig); // 64 字符
}

async function issueSession(
  env: Env,
  openid: string,
  unionid: string | null,
): Promise<LoginResult> {
  const { id: userId, isNew } = await upsertUser(env, openid, unionid);
  const expiresAt = nowSec() + SESSION_TTL_SEC;

  let token = await makeSessionToken(env, userId);
  const result = await env.DB.batch([
    prepareEnsureQuotaRow(env, userId),
    prepareCreateSession(env, token, userId, expiresAt),
  ]);
  if ((result[1].meta?.changes ?? 0) === 0) {
    token = await makeSessionToken(env, userId);
    const retry = await prepareCreateSession(env, token, userId, expiresAt).run();
    if ((retry.meta?.changes ?? 0) === 0) {
      throw new ApiError(500, 'INTERNAL', 'session token collision twice');
    }
  }

  return { token, expires_at: expiresAt, user_id: userId, is_new: isNew };
}

// ── public ────────────────────────────────────────────

export interface LoginResult {
  token: string;
  expires_at: number;
  user_id: number;
  is_new: boolean;
}

export async function login(env: Env, code: string): Promise<LoginResult> {
  if (!code || typeof code !== 'string') fail('INVALID_CODE', 'code is required');

  let openid: string;
  let unionid: string | null = null;

  if (env.WX_MOCK === '1') {
    // dev only: code 即作 mock openid 后缀
    const safeCode = code.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 32) || 'anon';
    openid = `mock_${safeCode}`;
  } else {
    const wx = await callJscode2Session(env, code);
    if (wx.errcode && wx.errcode !== 0) {
      // 区分用户侧错（前端可重 wx.login）vs 服务端故障
      //   40029 = invalid js_code（已用过/过期），40163 = code been used
      //   其余如 45011（频次限）/ 40226（风控）/ 网络故障 → WX_API_FAIL
      const userSideErrors = new Set([40029, 40163]);
      const errInfo = `wx errcode=${wx.errcode} errmsg=${wx.errmsg ?? ''}`;
      if (userSideErrors.has(wx.errcode)) fail('INVALID_CODE', errInfo);
      fail('WX_API_FAIL', errInfo);
    }
    if (!wx.openid) fail('WX_API_FAIL', 'wx openid missing');
    openid = wx.openid;
    unionid = wx.unionid ?? null;
  }

  return issueSession(env, openid, unionid);
}

export async function loginWeb(env: Env, anonymousId: string): Promise<LoginResult> {
  return issueSession(env, `web_${anonymousId}`, null);
}

/**
 * verifyToken: 用于 authMw。返回 SessionCtx 或 null（调用方决定 401 时机）。
 * 这里只查 sessions 表 + 过期判定，不联表 users（FK 已保证存在）。
 */
export async function verifyToken(env: Env, token: string): Promise<SessionCtx | null> {
  if (!token || token.length !== 64) return null;          // 长度 fail-fast 挡爆破
  if (!/^[0-9a-f]+$/.test(token)) return null;             // hex 格式
  const row = await getSessionByToken(env, token);
  if (!row) return null;
  return { userId: row.user_id, token };
}
