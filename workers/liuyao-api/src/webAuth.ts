import type { Env } from './types';
import { fail } from './errors';
import { loginWeb } from './auth';
import { getQuota } from './quota';
import { nowSec, todayStrTZ } from './db';

export const WEB_SESSION_COOKIE = 'liuyao_session';

interface TurnstileResult {
  success?: boolean;
  hostname?: string;
  ['error-codes']?: string[];
}

export function allowedWebOrigins(env: Env): string[] {
  return env.WEB_ORIGINS.split(',').map((origin) => origin.trim()).filter(Boolean);
}

export function isAllowedWebOrigin(env: Env, origin: string | undefined): boolean {
  if (!origin) return false;
  return allowedWebOrigins(env).includes(origin);
}

export async function verifyTurnstile(env: Env, token: string, ip: string): Promise<void> {
  if (!token) fail('TURNSTILE_FAILED', 'human verification required');
  const form = new FormData();
  form.set('secret', env.TURNSTILE_SECRET_KEY);
  form.set('response', token);
  if (ip && ip !== 'unknown') form.set('remoteip', ip);

  let response: Response;
  try {
    response = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      body: form,
    });
  } catch {
    fail('SERVICE_UNAVAIL', 'human verification unavailable');
  }
  if (!response.ok) fail('SERVICE_UNAVAIL', 'human verification unavailable');
  const result = await response.json<TurnstileResult>();
  if (!result.success) fail('TURNSTILE_FAILED', 'human verification failed');

  if (env.ENV === 'prod') {
    if (!result.hostname) fail('TURNSTILE_FAILED', 'verification hostname missing');
    const allowedHosts = new Set(allowedWebOrigins(env).map((origin) => new URL(origin).hostname));
    if (!allowedHosts.has(result.hostname)) fail('TURNSTILE_FAILED', 'verification hostname rejected');
  }
}

async function hashIp(env: Env, ip: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(env.SESSION_HMAC_SECRET),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(ip));
  return Array.from(new Uint8Array(signature), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export async function consumeSessionCreationAllowance(env: Env, ip: string): Promise<void> {
  const max = Math.max(1, parseInt(env.WEB_SESSION_CREATIONS_PER_IP, 10) || 3);
  const ipHash = await hashIp(env, ip || 'unknown');
  const day = todayStrTZ(env);
  const row = await env.DB.prepare(
    `INSERT INTO web_auth_rate (ip_hash, day, attempts, updated_at)
     VALUES (?, ?, 1, ?)
     ON CONFLICT(ip_hash, day) DO UPDATE SET
       attempts = web_auth_rate.attempts + 1,
       updated_at = excluded.updated_at
     RETURNING attempts`,
  ).bind(ipHash, day, nowSec()).first<{ attempts: number }>();
  if (!row || row.attempts > max) fail('RATE_LIMIT', 'too many anonymous sessions today');
}

export async function createWebSession(env: Env, turnstileToken: string, ip: string) {
  await verifyTurnstile(env, turnstileToken, ip);
  await consumeSessionCreationAllowance(env, ip);
  const anonymousId = crypto.randomUUID().replace(/-/g, '');
  const login = await loginWeb(env, anonymousId);
  const quota = await getQuota(env, login.user_id);
  return { login, quota };
}

export function webSessionCookieOptions(env: Env, expiresAt: number, atSec = nowSec()) {
  return {
    httpOnly: true,
    secure: env.ENV === 'prod',
    sameSite: 'Lax' as const,
    path: '/',
    maxAge: Math.max(0, expiresAt - atSec),
  };
}
