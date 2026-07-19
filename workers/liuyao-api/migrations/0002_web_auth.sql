-- Website anonymous-session creation limiter. IPs are HMACed before storage.
CREATE TABLE web_auth_rate (
  ip_hash    TEXT NOT NULL,
  day        TEXT NOT NULL,
  attempts   INTEGER NOT NULL DEFAULT 0 CHECK(attempts >= 0),
  updated_at INTEGER NOT NULL,
  PRIMARY KEY(ip_hash, day)
);

CREATE INDEX idx_web_auth_rate_updated ON web_auth_rate(updated_at);

-- The Web launch changes the shared daily allowance from 3 to 10 immediately.
UPDATE user_quota
   SET daily_remaining = 10,
       updated_at = unixepoch()
 WHERE daily_remaining < 10;
