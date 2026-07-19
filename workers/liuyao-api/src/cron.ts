// scheduled() · Workers Cron 定时任务
//
// 触发：wrangler.toml [triggers] crons = ["0 */1 * * *"]（每小时整点）
//
// 任务：
//   1. 卡密余量监控：SELECT count by product_id WHERE status='dispatched'，任一档 < 30 → Telegram 告警
//   2. 过期 session 清理（轻量，不发告警）
//   3. 过期匿名鉴权频控记录清理

import type { Env } from './types';

const ALERT_THRESHOLD = 30;
// 注：暂不实现告警去重；每小时同 product 重复告警是有意为之（防漏报）。
// 若日后嫌噪，可在此加去重表 / KV TTL。

interface CronCtx {
  env: Env;
}

export async function runCron(ctx: CronCtx): Promise<void> {
  await Promise.all([
    monitorCodePool(ctx).catch((e) => console.error('[cron] code-pool failed:', e)),
    cleanExpiredSessions(ctx).catch((e) => console.error('[cron] session-cleanup failed:', e)),
    cleanWebAuthRate(ctx).catch((e) => console.error('[cron] web-auth-cleanup failed:', e)),
  ]);
}

async function cleanWebAuthRate({ env }: CronCtx): Promise<void> {
  const keepSince = Math.floor(Date.now() / 1000) - 8 * 86400;
  await env.DB.prepare(
    `DELETE FROM web_auth_rate WHERE updated_at < ?`,
  ).bind(keepSince).run();
}

async function monitorCodePool({ env }: CronCtx): Promise<void> {
  const rows = await env.DB.prepare(
    `SELECT product_id, COUNT(*) AS remaining
       FROM redemption_codes
      WHERE status = 'dispatched'
      GROUP BY product_id`,
  ).all<{ product_id: string; remaining: number }>();

  const lowProducts = (rows.results ?? []).filter((r) => r.remaining < ALERT_THRESHOLD);
  if (lowProducts.length === 0) return;

  // 去重：在 usage_log 里借一行作"上次告警时间"标记
  // 简化方案：把 endpoint='legacy_root' trace_id='cron_alert_<product>' 借位（schema CHECK 允许 endpoint，
  //          但我们其实不希望污染主路径日志）。改用独立 KV-like 方案：用 user_id=NULL?——FK 不允许 NULL。
  //
  // 最干净：直接发告警，不去重。Telegram bot 重复消息问题不大；用户嫌烦再加去重。
  // 阶段 8 先实现最小可用，后续观察决定是否加去重。

  for (const r of lowProducts) {
    const msg = `[liuyao] 卡密余量告警 product=${r.product_id} remaining=${r.remaining} (< ${ALERT_THRESHOLD})\n请运行 gen-codes 补码（命令见 worker/README.md）。`;
    await sendTelegram(env, msg).catch((e) =>
      console.error(`[cron] telegram fail for ${r.product_id}:`, e),
    );
  }
}

async function cleanExpiredSessions({ env }: CronCtx): Promise<void> {
  const now = Math.floor(Date.now() / 1000);
  const res = await env.DB.prepare(
    `DELETE FROM sessions WHERE expires_at < ?`,
  ).bind(now).run();
  const n = res.meta?.changes ?? 0;
  if (n > 0) console.log(`[cron] cleaned ${n} expired sessions`);
}

async function sendTelegram(env: Env, text: string): Promise<void> {
  if (!env.TELEGRAM_BOT_TOKEN || !env.TELEGRAM_CHAT_ID) {
    console.warn('[cron] telegram secrets missing, skipping alert');
    return;
  }
  const url = `https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: env.TELEGRAM_CHAT_ID,
      text,
      disable_web_page_preview: true,
    }),
  });
  if (!res.ok) {
    const snippet = await res.text().then((t) => t.slice(0, 200)).catch(() => '');
    throw new Error(`telegram http ${res.status}: ${snippet}`);
  }
}
