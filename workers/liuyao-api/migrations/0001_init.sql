-- 0001_init.sql · 六爻变现系统首版 schema
--
-- 5 张表 + 索引：
--   users            微信 openid → 内部 user_id
--   sessions         session token (HMAC) → user_id，30d 过期
--   user_quota       三档 quota：daily / permanent / unlimited_until
--   redemption_codes 卡密池：dispatched → redeemed/disabled/expired
--   usage_log        每次 /interpret 一行，refund 时同行 mutate
--
-- 时间统一存 unix seconds (INTEGER)，TZ 转换由 worker 端按 TZ_OFFSET_MINUTES 处理。
-- daily_reset_date 是字符串 'YYYY-MM-DD'（已按 TZ 截断），与 unix 时间戳分工不冲突。
--
-- 约束策略：所有 status 字段都用 CHECK 锁定枚举；payload 用 json_valid 兜底；
--           quota 计数器加非负 CHECK 防御并发漏 WHERE。
-- FK 行为：D1 默认 PRAGMA foreign_keys=ON，worker 启动时不需额外开启。
--          删用户级联删 sessions/user_quota/usage_log，保留 redemption_codes (审计)。

-- ── users ─────────────────────────────────────────────
CREATE TABLE users (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  openid       TEXT NOT NULL UNIQUE,        -- UNIQUE 自带索引，无需额外 CREATE INDEX
  unionid      TEXT,
  created_at   INTEGER NOT NULL,
  last_seen_at INTEGER NOT NULL
);

-- ── sessions ──────────────────────────────────────────
-- token 是 hex(HMAC_SHA256(SESSION_HMAC_SECRET, "<user_id>.<rand>.<now>")) 64 字符
CREATE TABLE sessions (
  token      TEXT PRIMARY KEY,
  user_id    INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE INDEX idx_sessions_user ON sessions(user_id);
CREATE INDEX idx_sessions_exp  ON sessions(expires_at);

-- ── user_quota ────────────────────────────────────────
-- 每用户一行；ensureQuotaRow 在首次 login 时创建默认值
-- 非负 CHECK 防御 worker 端漏 WHERE 子句导致计数器越过 0
CREATE TABLE user_quota (
  user_id           INTEGER PRIMARY KEY,
  daily_remaining   INTEGER NOT NULL DEFAULT 3,
  daily_reset_date  TEXT NOT NULL,                -- 'YYYY-MM-DD' 按 TZ_OFFSET 截断
  permanent_balance INTEGER NOT NULL DEFAULT 0,
  unlimited_until   INTEGER NOT NULL DEFAULT 0,   -- 0 = 无包月；> 0 = 包月到期 unix
  total_consumed    INTEGER NOT NULL DEFAULT 0,
  updated_at        INTEGER NOT NULL,
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
  CHECK(daily_remaining >= 0),
  CHECK(permanent_balance >= 0),
  CHECK(unlimited_until >= 0),
  CHECK(total_consumed >= 0)
);

-- ── redemption_codes ──────────────────────────────────
-- code 形如 LY-XXXX-XXXX-YYYY，HMAC 嵌在末段 YYYY 内
-- payload 是 JSON：
--   permanent: {"type":"permanent","amount":10}
--   unlimited: {"type":"unlimited_days","days":30}
-- json_valid 是 SQLite/D1 内置函数，拦截非法 JSON 写入
CREATE TABLE redemption_codes (
  code        TEXT PRIMARY KEY,
  batch_id    TEXT NOT NULL,
  product_id  TEXT NOT NULL,
  payload     TEXT NOT NULL,
  status      TEXT NOT NULL DEFAULT 'dispatched'
              CHECK(status IN ('dispatched','redeemed','disabled','expired')),
  redeemed_by INTEGER,
  redeemed_at INTEGER,
  expires_at  INTEGER NOT NULL DEFAULT 0,         -- 0 = 永久有效
  created_at  INTEGER NOT NULL,
  FOREIGN KEY(redeemed_by) REFERENCES users(id) ON DELETE SET NULL,
  CHECK(json_valid(payload))
);
CREATE INDEX idx_codes_batch ON redemption_codes(batch_id);
-- (status, product_id) 复合：监控 cron 走索引；按 status 过滤的查询用复合索引前缀
CREATE INDEX idx_codes_status_product ON redemption_codes(status, product_id);

-- ── usage_log ─────────────────────────────────────────
-- 每次 /interpret 一行，状态 pending → success/failed[+refunded=1]
CREATE TABLE usage_log (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id           INTEGER NOT NULL,
  endpoint          TEXT NOT NULL CHECK(endpoint IN ('interpret','legacy_root')),
  trace_id          TEXT NOT NULL UNIQUE,
  quota_source      TEXT NOT NULL CHECK(quota_source IN ('daily','permanent','unlimited','none')),
  status            TEXT NOT NULL CHECK(status IN ('pending','success','failed')),
  upstream_ms       INTEGER,
  upstream_status   INTEGER,
  prompt_tokens     INTEGER,
  completion_tokens INTEGER,
  error_code        TEXT,
  refunded          INTEGER NOT NULL DEFAULT 0 CHECK(refunded IN (0,1)),
  created_at        INTEGER NOT NULL,
  finished_at       INTEGER,
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE INDEX idx_usage_user_time ON usage_log(user_id, created_at DESC);
-- trace_id UNIQUE 自带索引，无需额外
CREATE INDEX idx_usage_endpoint  ON usage_log(endpoint, created_at DESC);
