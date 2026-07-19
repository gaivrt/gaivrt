// Quota 三档模型：unlimited > daily > permanent
//
// 资格检查：unlimited_until > now → 'unlimited'，不扣 quota
//          else daily_remaining > 0 → 'daily'，daily_remaining -= 1
//          else permanent_balance > 0 → 'permanent'，permanent_balance -= 1
//          else 'EXHAUSTED'
//
// 重置：daily_reset_date != today(TZ) → daily_remaining = FREE_DAILY_QUOTA, daily_reset_date = today
//      重置在 read/consume 前 lazy 触发；用单条 UPDATE...RETURNING 合并 reset + 读快照（1 RTT）。
//
// 失败回滚：refund(userId, source, logId) 把扣下的 1 加回去（unlimited 不退）。
//          幂等通过 usage_log.refunded 标记：UPDATE refunded=1 WHERE refunded=0，
//          0 changes 时不再动 quota。
//
// 并发：所有 UPDATE 都带 WHERE 条件防越界，配合 schema CHECK(>=0) 双保险。

import type { Env, QuotaRow, QuotaSource } from './types';
import { ApiError, fail } from './errors';
import { todayStrTZ, nowSec } from './db';

/**
 * 一次 UPDATE...RETURNING 完成 reset 检查 + 读快照。
 * 当 daily_reset_date < today 时把 daily_remaining 重置为 FREE_DAILY_QUOTA。
 * 否则 row 字段不变，依然返回当前快照。
 */
async function readWithReset(env: Env, userId: number): Promise<QuotaRow> {
  const today = todayStrTZ(env);
  const dailyDefault = parseInt(env.FREE_DAILY_QUOTA, 10) || 10;
  const now = nowSec();

  const row = await env.DB.prepare(
    `UPDATE user_quota SET
       daily_remaining  = CASE WHEN daily_reset_date < ?1 THEN ?2 ELSE daily_remaining END,
       daily_reset_date = CASE WHEN daily_reset_date < ?1 THEN ?1 ELSE daily_reset_date END,
       updated_at       = ?3
     WHERE user_id = ?4
     RETURNING user_id, daily_remaining, daily_reset_date, permanent_balance,
               unlimited_until, total_consumed, updated_at`,
  ).bind(today, dailyDefault, now, userId).first<QuotaRow>();

  if (!row) {
    // ensureQuotaRow 在 login 时建；走到这里说明用户已登录但 quota 行被异常清理
    throw new ApiError(500, 'INTERNAL', 'user_quota row missing');
  }
  return row;
}

export async function getQuota(env: Env, userId: number): Promise<QuotaRow> {
  return readWithReset(env, userId);
}

/**
 * Consume：扣一次 quota。
 * - unlimited 命中且 UPDATE OK → 'unlimited'（total_consumed +1）
 * - unlimited 命中但 UPDATE race 落空（包月恰好这一刻过期）→ fallthrough
 * - daily 命中且 UPDATE OK → 'daily'
 * - daily race 落空 → fallthrough
 * - permanent 命中且 UPDATE OK → 'permanent'
 * - 全部 race 落空 → 'EXHAUSTED'
 */
export async function consume(
  env: Env,
  userId: number,
): Promise<{ ok: true; source: QuotaSource } | { ok: false; reason: 'EXHAUSTED' }> {
  const row = await readWithReset(env, userId);
  const now = nowSec();

  // 1. unlimited（不扣余额，但记 total_consumed）
  if (row.unlimited_until > now) {
    const r = await env.DB.prepare(
      `UPDATE user_quota SET total_consumed = total_consumed + 1, updated_at = ?
       WHERE user_id = ? AND unlimited_until > ?`,
    ).bind(now, userId, now).run();
    if ((r.meta?.changes ?? 0) === 1) return { ok: true, source: 'unlimited' };
    // race：恰好这一刻过期 → fallthrough
  }

  // 2. daily
  if (row.daily_remaining > 0) {
    const r = await env.DB.prepare(
      `UPDATE user_quota
         SET daily_remaining = daily_remaining - 1,
             total_consumed  = total_consumed + 1,
             updated_at      = ?
       WHERE user_id = ? AND daily_remaining > 0`,
    ).bind(now, userId).run();
    if ((r.meta?.changes ?? 0) === 1) return { ok: true, source: 'daily' };
  }

  // 3. permanent
  if (row.permanent_balance > 0) {
    const r = await env.DB.prepare(
      `UPDATE user_quota
         SET permanent_balance = permanent_balance - 1,
             total_consumed    = total_consumed + 1,
             updated_at        = ?
       WHERE user_id = ? AND permanent_balance > 0`,
    ).bind(now, userId).run();
    if ((r.meta?.changes ?? 0) === 1) return { ok: true, source: 'permanent' };
  }

  // 4. 全无
  return { ok: false, reason: 'EXHAUSTED' };
}

/**
 * Refund：把 consume 扣的一次还回来。
 *
 * 幂等机制：通过 usage_log.refunded 标记占位。
 *   - logId !== null：UPDATE log SET refunded=1 WHERE id=? AND refunded=0
 *     0 changes（已退过/日志不存在）→ 直接返回不动 quota
 *     1 change → 才更新 user_quota
 *   - logId === null：极端路径（consume 成功但 insertUsageLog 失败）。
 *     调用方只会调一次 refund，无幂等需求；直接退一次。
 *
 * unlimited 不退余额（本就没扣）；usage_log.refunded 仍打 1，便于审计。
 */
export async function refund(
  env: Env,
  userId: number,
  source: QuotaSource,
  logId: number | null,
): Promise<void> {
  if (logId !== null) {
    const claim = await env.DB.prepare(
      `UPDATE usage_log SET refunded = 1, finished_at = ? WHERE id = ? AND refunded = 0`,
    ).bind(nowSec(), logId).run();
    if ((claim.meta?.changes ?? 0) !== 1) return;
  }
  if (source === 'unlimited') return;

  const col = source === 'daily' ? 'daily_remaining' : 'permanent_balance';
  await env.DB.prepare(
    `UPDATE user_quota
       SET ${col} = ${col} + 1,
           total_consumed = MAX(total_consumed - 1, 0),
           updated_at = ?
     WHERE user_id = ?`,
  ).bind(nowSec(), userId).run();
}

/**
 * applyRedemption：卡密兑换后把 payload 应用到 quota。
 * payload 字段 amount/days 来自 redemption_codes.payload，可能被管理员录错。
 * 非法值抛 BAD_REDEMPTION (422)，让前端区分"次数已尽 (402)" vs"兑换码异常 (422)"。
 *
 * permanent {amount} → permanent_balance += amount
 * unlimited_days {days} → unlimited_until = MAX(unlimited_until, now) + days*86400
 *   设计意图：从已有包月剩余基础上叠加，未到期不"重置回 now"
 */
export async function applyRedemption(
  env: Env,
  userId: number,
  payload: { type: 'permanent'; amount: number } | { type: 'unlimited_days'; days: number },
): Promise<QuotaRow> {
  const now = nowSec();

  if (payload.type === 'permanent') {
    if (!Number.isInteger(payload.amount) || payload.amount <= 0) {
      fail('BAD_REDEMPTION', `bad permanent amount: ${payload.amount}`);
    }
    await env.DB.prepare(
      `UPDATE user_quota
         SET permanent_balance = permanent_balance + ?, updated_at = ?
       WHERE user_id = ?`,
    ).bind(payload.amount, now, userId).run();
  } else if (payload.type === 'unlimited_days') {
    if (!Number.isInteger(payload.days) || payload.days <= 0) {
      fail('BAD_REDEMPTION', `bad unlimited_days: ${payload.days}`);
    }
    // bind 顺序：?1=now (MAX 的 floor)，?2=addSec (增量)，?3=now (updated_at)
    const addSec = payload.days * 86400;
    await env.DB.prepare(
      `UPDATE user_quota
         SET unlimited_until = MAX(unlimited_until, ?1) + ?2, updated_at = ?3
       WHERE user_id = ?4`,
    ).bind(now, addSec, now, userId).run();
  } else {
    fail('BAD_REDEMPTION', `unknown payload type: ${(payload as any).type}`);
  }

  const row = await readWithReset(env, userId);
  return row;
}
