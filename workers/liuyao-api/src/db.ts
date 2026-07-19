// D1 query helpers · 收紧 worker → DB 的所有调用面
//
// 设计原则：
//   - 每个函数接收 Env，使用 env.DB.prepare(...).bind(...).first/run/all
//   - 返回 typed object 或 null，不抛 D1 原始错误（让上层归一化）
//   - SELECT 用 first<T>()；INSERT/UPDATE 用 run() 检查 meta.changes
//   - 时间统一 unix seconds（worker 端用 Math.floor(Date.now()/1000)）

import type { Env, QuotaRow } from './types';

export function nowSec(): number {
  return Math.floor(Date.now() / 1000);
}

// 按 TZ_OFFSET_MINUTES 截断的 'YYYY-MM-DD'，用于 daily_reset_date
export function todayStrTZ(env: Env, atSec?: number): string {
  const offset = parseInt(env.TZ_OFFSET_MINUTES, 10) || 0;
  const ms = ((atSec ?? nowSec()) + offset * 60) * 1000;
  const d = new Date(ms);
  // d 已经是 UTC 视角下的"等价时间"，直接取 UTC 部分即为本地日历
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

// ── users ─────────────────────────────────────────────

export interface UserRow {
  id: number;
  openid: string;
  unionid: string | null;
  created_at: number;
  last_seen_at: number;
}

/**
 * upsert 用户：openid 已存在则 last_seen_at 更新，否则插入。
 * 用 INSERT ... ON CONFLICT(openid) DO UPDATE ... RETURNING 一次往返完成。
 * D1 SQLite ≥ 3.35 支持 RETURNING；ON CONFLICT 是原子语义，无 race。
 *
 * isNew 判定：用 created_at == last_seen_at 等价比较（DO UPDATE 把 last_seen_at 改成新值，
 *           所以已存在用户的 created_at < 新 last_seen_at；新插用户两者相等）。
 */
export async function upsertUser(
  env: Env,
  openid: string,
  unionid: string | null,
): Promise<{ id: number; isNew: boolean }> {
  const now = nowSec();

  const row = await env.DB.prepare(
    `INSERT INTO users (openid, unionid, created_at, last_seen_at)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(openid) DO UPDATE SET
       last_seen_at = excluded.last_seen_at,
       unionid      = COALESCE(users.unionid, excluded.unionid)
     RETURNING id, created_at, last_seen_at`,
  ).bind(openid, unionid, now, now).first<{
    id: number; created_at: number; last_seen_at: number;
  }>();

  if (!row) throw new Error('upsertUser: RETURNING produced no row');
  return { id: row.id, isNew: row.created_at === row.last_seen_at };
}

// ── batch helpers ────────────────────────────────────
// D1 batch 支持把多条 prepare().bind() 一次发送，原子且省 RTT。

/**
 * 准备 ensureQuotaRow 的 prepared statement（不立即执行）。
 * 用于 batch 拼接。
 */
export function prepareEnsureQuotaRow(env: Env, userId: number): D1PreparedStatement {
  const now = nowSec();
  const today = todayStrTZ(env);
  const dailyDefault = parseInt(env.FREE_DAILY_QUOTA, 10) || 10;
  return env.DB.prepare(
    `INSERT OR IGNORE INTO user_quota
       (user_id, daily_remaining, daily_reset_date, permanent_balance,
        unlimited_until, total_consumed, updated_at)
     VALUES (?, ?, ?, 0, 0, 0, ?)`,
  ).bind(userId, dailyDefault, today, now);
}

/**
 * 准备 createSession 的 prepared statement，用 INSERT OR IGNORE 防御 race。
 * 如果 token 撞了（理论极小概率：HMAC over 16B rand + nowSec），返回 0 changes，
 * 调用方应重生成 token 重试。
 */
export function prepareCreateSession(
  env: Env,
  token: string,
  userId: number,
  expiresAt: number,
): D1PreparedStatement {
  return env.DB.prepare(
    `INSERT OR IGNORE INTO sessions (token, user_id, created_at, expires_at)
     VALUES (?, ?, ?, ?)`,
  ).bind(token, userId, nowSec(), expiresAt);
}

// ── quota ─────────────────────────────────────────────

export async function ensureQuotaRow(env: Env, userId: number): Promise<void> {
  const now = nowSec();
  const today = todayStrTZ(env);
  const dailyDefault = parseInt(env.FREE_DAILY_QUOTA, 10) || 10;

  await env.DB.prepare(
    `INSERT OR IGNORE INTO user_quota
       (user_id, daily_remaining, daily_reset_date, permanent_balance,
        unlimited_until, total_consumed, updated_at)
     VALUES (?, ?, ?, 0, 0, 0, ?)`,
  ).bind(userId, dailyDefault, today, now).run();
}

export async function getQuotaRow(env: Env, userId: number): Promise<QuotaRow | null> {
  return await env.DB.prepare(
    `SELECT user_id, daily_remaining, daily_reset_date, permanent_balance,
            unlimited_until, total_consumed, updated_at
     FROM user_quota WHERE user_id = ?`,
  ).bind(userId).first<QuotaRow>();
}

// ── sessions ──────────────────────────────────────────

export async function createSession(
  env: Env,
  token: string,
  userId: number,
  expiresAt: number,
): Promise<boolean> {
  const res = await prepareCreateSession(env, token, userId, expiresAt).run();
  return (res.meta?.changes ?? 0) > 0;
}

export interface SessionLookup {
  user_id: number;
  expires_at: number;
}

/**
 * 用 token 查 session。返回 null 表示不存在或已过期（调用方一律 401）。
 */
export async function getSessionByToken(env: Env, token: string): Promise<SessionLookup | null> {
  const row = await env.DB.prepare(
    `SELECT user_id, expires_at FROM sessions WHERE token = ?`,
  ).bind(token).first<SessionLookup>();
  if (!row) return null;
  if (row.expires_at < nowSec()) return null;
  return row;
}

/**
 * 删除过期 session（cron 调用，非阻塞）。
 */
export async function deleteExpiredSessions(env: Env): Promise<number> {
  const res = await env.DB.prepare(
    `DELETE FROM sessions WHERE expires_at < ?`,
  ).bind(nowSec()).run();
  return res.meta?.changes ?? 0;
}
