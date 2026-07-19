// 全局类型契约
//
// Env 是 wrangler 注入的 binding：
//   - vars 来自 wrangler.toml [vars] / [env.production.vars]
//   - secrets 来自 `wrangler secret put` 或本地 .dev.vars
//   - DB 来自 [[d1_databases]] binding
//
// D1 注记：Workers D1 binding 默认 PRAGMA foreign_keys=ON 且无法关闭，
//          worker 启动不需显式 PRAGMA。schema CHECK 约束已加在 0001_init.sql。

export interface Env {
  // bindings
  DB: D1Database;

  // vars (wrangler.toml) —— 所有 vars 都是 string，下游用前 parseInt / 字面量判断
  ENV: 'dev' | 'prod';
  WX_APPID: string;
  DEEPSEEK_BASE_URL: string;
  DEEPSEEK_MODEL: string;
  FREE_DAILY_QUOTA: string;             // 用前 parseInt
  TZ_OFFSET_MINUTES: string;            // '480' = Asia/Shanghai
  LEGACY_ROOT_FALLBACK: 'true' | 'false';
  WX_MOCK: '0' | '1';                   // '1' = 跳过真 jscode2session
  WEB_ORIGINS: string;                  // comma-separated exact origins
  WEB_SESSION_CREATIONS_PER_IP: string; // successful anonymous sessions per IP/day

  // secrets (wrangler secret put)
  WX_APPSECRET: string;
  DEEPSEEK_API_KEY: string;
  CODE_HMAC_SECRET: string;
  SESSION_HMAC_SECRET: string;
  TURNSTILE_SECRET_KEY: string;

  // 阶段 8 后启用（可选 secrets，不配 cron 也能跑，告警自动 skip）
  TELEGRAM_BOT_TOKEN: string;
  TELEGRAM_CHAT_ID: string;
}

export interface SessionCtx {
  userId: number;
  token: string;
}

export type QuotaSource = 'unlimited' | 'daily' | 'permanent';

export interface QuotaRow {
  user_id: number;
  daily_remaining: number;
  daily_reset_date: string;
  permanent_balance: number;
  unlimited_until: number;
  total_consumed: number;
  updated_at: number;
}

export interface CodePayloadPermanent {
  type: 'permanent';
  amount: number;
}
export interface CodePayloadUnlimited {
  type: 'unlimited_days';
  days: number;
}
export type CodePayload = CodePayloadPermanent | CodePayloadUnlimited;

// Hono context variables
export type AppVars = {
  traceId: string;
  session?: SessionCtx;
};
