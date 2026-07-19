// /interpret · DeepSeek 透传 + quota 计费
//
// 流程：
//   1. authMw 已注入 session.userId
//   2. 校验 messages 非空、max_tokens/temperature 钳到合理范围
//   3. consume → EXHAUSTED 返 402
//   4. INSERT usage_log status=pending + traceId + source
//   5. callDeepSeek →
//        catch → refund(logId) + UPDATE log status=failed → 502
//        ok    → UPDATE log status=success + tokens + upstream_ms
//   6. 返回 {choices, usage, quota_after, trace_id}
//      字段同形于现有 DeepSeek 响应，小程序解析层零改动。

import type { Env, QuotaSource } from './types';
import { ApiError, fail } from './errors';
import { consume, refund, getQuota } from './quota';
import { callDeepSeek, type DeepSeekRequest } from './deepseek';
import { nowSec } from './db';

const MAX_TOKENS_HARD = 4096;
const TEMP_MIN = 0;
const TEMP_MAX = 2;
const MAX_MESSAGES = 32;
const MAX_CONTENT_CHARS = 12000;     // 单条消息硬上限，防 prompt injection 灌爆

// 模型白名单：非白名单值回落到 env.DEEPSEEK_MODEL，避免被滥用调昂贵模型
const ALLOWED_MODELS = new Set<string>([
  'deepseek-chat',
  'deepseek-reasoner',
]);

interface InterpretBody {
  messages?: unknown;
  model?: unknown;
  max_tokens?: unknown;
  temperature?: unknown;
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(Math.max(n, lo), hi);
}

function validateAndNormalize(raw: unknown): DeepSeekRequest {
  if (!raw || typeof raw !== 'object') fail('BAD_REQUEST', 'json body required');
  const b = raw as InterpretBody;
  if (!Array.isArray(b.messages) || b.messages.length === 0) {
    fail('BAD_REQUEST', 'messages must be non-empty array');
  }
  if (b.messages.length > MAX_MESSAGES) {
    fail('BAD_REQUEST', `too many messages (max ${MAX_MESSAGES})`);
  }
  const messages = b.messages.map((m: any, i) => {
    if (!m || typeof m !== 'object') fail('BAD_REQUEST', `messages[${i}] not object`);
    const role = m.role;
    const content = m.content;
    if (role !== 'system' && role !== 'user' && role !== 'assistant') {
      fail('BAD_REQUEST', `messages[${i}].role invalid`);
    }
    if (typeof content !== 'string' || content.length === 0) {
      fail('BAD_REQUEST', `messages[${i}].content must be non-empty string`);
    }
    if (content.length > MAX_CONTENT_CHARS) {
      fail('BAD_REQUEST', `messages[${i}].content too long`);
    }
    return { role, content };
  });

  const max_tokens =
    typeof b.max_tokens === 'number' && Number.isFinite(b.max_tokens)
      ? clamp(Math.floor(b.max_tokens), 1, MAX_TOKENS_HARD)
      : 2500;

  const temperature =
    typeof b.temperature === 'number' && Number.isFinite(b.temperature)
      ? clamp(b.temperature, TEMP_MIN, TEMP_MAX)
      : 1.0;

  // model 走白名单；非法值回落到 env 默认（不报错，向后兼容老客户端）
  const model =
    typeof b.model === 'string' && ALLOWED_MODELS.has(b.model) ? b.model : undefined;

  return { messages, max_tokens, temperature, model };
}

async function insertUsageLog(
  env: Env,
  userId: number,
  source: QuotaSource,
  traceId: string,
  endpoint: 'interpret' | 'legacy_root',
): Promise<number> {
  const res = await env.DB.prepare(
    `INSERT INTO usage_log
       (user_id, endpoint, trace_id, quota_source, status, refunded, created_at)
     VALUES (?, ?, ?, ?, 'pending', 0, ?)
     RETURNING id`,
  ).bind(userId, endpoint, traceId, source, nowSec()).first<{ id: number }>();
  if (!res) throw new ApiError(500, 'INTERNAL', 'usage_log insert no row');
  return res.id;
}

export interface InterpretResult {
  choices: any;
  usage: any;
  quota_after: {
    daily_remaining: number;
    daily_reset_date: string;
    permanent_balance: number;
    unlimited_until: number;
    total_consumed: number;
  };
  trace_id: string;
}

/**
 * 主流程。一旦 consume 成功，所有后续路径都必须保证最终 refund（除非 success）。
 * 用嵌套 try-catch 严格约束：
 *   外层 try：覆盖 insertUsageLog 失败 → refund(logId=null)
 *   内层 try：覆盖 callDeepSeek 失败 → refund(logId) + UPDATE log failed (swallow)
 */
export async function interpret(
  env: Env,
  userId: number,
  rawBody: unknown,
  traceId: string,
): Promise<InterpretResult> {
  const req = validateAndNormalize(rawBody);

  // 1. validate 在 consume 前，BAD_REQUEST 直接抛不需 refund
  const cs = await consume(env, userId);
  if (!cs.ok) fail('QUOTA_EXHAUSTED', 'no quota left');
  const source = cs.source;

  // 2. consume 之后任何 throw 都要 refund
  let logId: number | null = null;
  try {
    logId = await insertUsageLog(env, userId, source, traceId, 'interpret');

    // 3. call upstream
    let result;
    try {
      result = await callDeepSeek(env, req);
    } catch (e) {
      // refund + 标 log failed；UPDATE log 失败 swallow，不掩盖原因
      await refund(env, userId, source, logId);
      try {
        await env.DB.prepare(
          `UPDATE usage_log SET status='failed', error_code=?, finished_at=? WHERE id=?`,
        ).bind(e instanceof ApiError ? e.code : 'UNKNOWN', nowSec(), logId).run();
      } catch (logErr) {
        console.error('[interpret] mark log failed swallowed:', traceId, logErr);
      }
      throw e;
    }

    // 4. log success
    await env.DB.prepare(
      `UPDATE usage_log
         SET status='success',
             upstream_ms=?, upstream_status=?,
             prompt_tokens=?, completion_tokens=?, finished_at=?
       WHERE id=?`,
    ).bind(
      result.upstreamMs,
      result.upstreamStatus,
      result.body.usage?.prompt_tokens ?? null,
      result.body.usage?.completion_tokens ?? null,
      nowSec(),
      logId,
    ).run();

    // 5. 拿最新 quota（与 GET /quota 字段同形）
    const after = await getQuota(env, userId);
    return {
      choices: result.body.choices,
      usage: result.body.usage,
      quota_after: {
        daily_remaining:   after.daily_remaining,
        daily_reset_date:  after.daily_reset_date,
        permanent_balance: after.permanent_balance,
        unlimited_until:   after.unlimited_until,
        total_consumed:    after.total_consumed,
      },
      trace_id: traceId,
    };
  } catch (outer) {
    // insertUsageLog 失败时 logId 仍 null，仍要 refund 一次
    if (logId === null) {
      try {
        await refund(env, userId, source, null);
      } catch (refundErr) {
        console.error('[interpret] refund failed swallowed:', traceId, refundErr);
      }
    }
    throw outer;
  }
}

// ── legacy root fallback ─────────────────────────────
//
// POST / 在灰度期保留 DeepSeek 直透传，保护未升级的小程序版本。
// 受 LEGACY_ROOT_FALLBACK 控制；切 'false' 后直接 410 Gone + 引导。
//
// 设计取舍：
//   - 不接 usage_log（FK 强约束 user_id，匿名用户硬塞会复杂化模型）
//   - 不做持久化 IP 限流（灰度期仅 2 周，console.log + worker tail 监控足够）
//   - 真出现滥用，直接切 LEGACY_ROOT_FALLBACK='false' 关停，比加复杂限流快
//   - 若灰度期延长或被刷量，再加 KV-based 计数（不污染主路径 D1）

export async function legacyRoot(
  env: Env,
  rawBody: unknown,
  ip: string,
  traceId: string,
): Promise<{ choices: any; usage: any }> {
  if (env.LEGACY_ROOT_FALLBACK !== 'true') {
    fail('GONE', 'legacy root disabled; please upgrade miniprogram');
  }
  const req = validateAndNormalize(rawBody);

  // 仅打日志便于 worker tail 观察灰度比例 & 滥用检测
  console.log(JSON.stringify({
    tag: 'legacy_root',
    trace_id: traceId,
    ip,
    msg_count: req.messages.length,
    ts: nowSec(),
  }));

  const result = await callDeepSeek(env, req);
  return {
    choices: result.body.choices,
    usage: result.body.usage,
  };
}
