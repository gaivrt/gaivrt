// /redeem · 卡密兑换
//
// 流程：
//   1. verifyCode（HMAC）失败 → 403 BAD_HMAC（**先于 DB**）
//   2. SELECT 卡密
//      not found       → 404 CODE_NOT_FOUND
//      status='redeemed' → 409 CODE_USED
//      status='disabled' → 409 CODE_USED（管理员废止，对用户呈现"已使用"）
//      status='expired'  → 410 CODE_EXPIRED
//      expires_at>0 && < now → 410 CODE_EXPIRED
//   3. 乐观锁：UPDATE WHERE code=? AND status='dispatched'，meta.changes==1 才算抢到
//   4. JSON.parse(payload) → applyRedemption
//   5. 返回 {product_id, payload, quota_after}

import type { Env, CodePayload, QuotaRow } from './types';
import { fail, ApiError } from './errors';
import { verifyCode } from './codes';
import { applyRedemption } from './quota';
import { nowSec } from './db';

interface RedemptionRow {
  code: string;
  product_id: string;
  payload: string;
  status: 'dispatched' | 'redeemed' | 'disabled' | 'expired';
  expires_at: number;
}

export interface RedeemResult {
  product_id: string;
  payload: CodePayload;
  quota_after: {
    daily_remaining: number;
    daily_reset_date: string;
    permanent_balance: number;
    unlimited_until: number;
    total_consumed: number;
  };
}

export async function redeem(
  env: Env,
  userId: number,
  rawCode: unknown,
): Promise<RedeemResult> {
  if (typeof rawCode !== 'string') fail('BAD_FORMAT', 'code must be string');
  const code = (rawCode as string).trim().toUpperCase();
  const now = nowSec();

  // 1. HMAC 先于 DB（挡爆破）
  const validHmac = await verifyCode(env.CODE_HMAC_SECRET, code);
  if (!validHmac) fail('BAD_HMAC', 'invalid code signature');

  // 2. SELECT 状态
  const row = await env.DB.prepare(
    `SELECT code, product_id, payload, status, expires_at
       FROM redemption_codes WHERE code = ?`,
  ).bind(code).first<RedemptionRow>();

  if (!row) fail('CODE_NOT_FOUND', 'code not found in pool');

  // 显式状态机分支
  // disabled 是管理员废止；对用户呈现"已使用"避免暴露 admin 操作 → 同走 CODE_USED 文案
  if (row.status === 'redeemed' || row.status === 'disabled') {
    if (row.status === 'disabled') console.log(`[redeem] disabled hit user=${userId} code=${code}`);
    fail('CODE_USED', 'code already used');
  }
  if (row.status === 'expired') fail('CODE_EXPIRED', 'code expired');
  if (row.expires_at > 0 && row.expires_at < now) {
    // ttl 过期但 status 未同步：顺手 UPDATE，省后续重复 SELECT
    await env.DB.prepare(
      `UPDATE redemption_codes SET status='expired'
       WHERE code=? AND status='dispatched'`,
    ).bind(code).run();
    fail('CODE_EXPIRED', 'code expired');
  }
  // 此时 status === 'dispatched'

  // 3. 乐观锁：抢这一张
  const claim = await env.DB.prepare(
    `UPDATE redemption_codes
       SET status='redeemed', redeemed_by=?, redeemed_at=?
     WHERE code=? AND status='dispatched'`,
  ).bind(userId, now, code).run();
  if ((claim.meta?.changes ?? 0) !== 1) {
    fail('CODE_USED', 'code already used');
  }

  // 4. parse + apply（apply 失败必须回滚卡密 status，否则用户卡作废但 quota 没加）
  let payload: CodePayload;
  try {
    payload = JSON.parse(row.payload);
  } catch (e) {
    // 回滚卡密
    await rollbackRedemption(env, code, userId).catch((err) =>
      console.error('[redeem] rollback after parse-fail swallowed:', err),
    );
    // schema CHECK(json_valid) 已守过，此处理论不可达
    throw new ApiError(500, 'INTERNAL', `payload json broken: ${(e as Error).message}`);
  }

  let after: QuotaRow;
  try {
    after = await applyRedemption(env, userId, payload as CodePayload);
  } catch (e) {
    await rollbackRedemption(env, code, userId).catch((err) =>
      console.error('[redeem] rollback after apply-fail swallowed:', err),
    );
    throw e;
  }

  return {
    product_id: row.product_id,
    payload,
    quota_after: {
      daily_remaining:   after.daily_remaining,
      daily_reset_date:  after.daily_reset_date,
      permanent_balance: after.permanent_balance,
      unlimited_until:   after.unlimited_until,
      total_consumed:    after.total_consumed,
    },
  };
}

/**
 * 把刚 redeem 的卡密回滚到 dispatched（条件：必须是当前用户刚刚 mark 的那一行）。
 * 用于 applyRedemption / payload parse 失败后保护用户。
 */
async function rollbackRedemption(env: Env, code: string, userId: number): Promise<void> {
  await env.DB.prepare(
    `UPDATE redemption_codes
       SET status='dispatched', redeemed_by=NULL, redeemed_at=NULL
     WHERE code=? AND status='redeemed' AND redeemed_by=?`,
  ).bind(code, userId).run();
}
