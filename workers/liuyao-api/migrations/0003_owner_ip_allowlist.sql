-- Owner-only interpretation bypass. IP addresses are HMACed before lookup/storage.
CREATE TABLE owner_ip_allowlist (
  ip_hash    TEXT PRIMARY KEY,
  enabled    INTEGER NOT NULL DEFAULT 1 CHECK(enabled IN (0, 1)),
  created_at INTEGER NOT NULL
);
