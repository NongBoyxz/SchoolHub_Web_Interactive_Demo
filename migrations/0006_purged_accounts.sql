-- v1.6.3: keep a pseudonymous user anchor for foreign-key references.
-- Apply exactly once, after backing up D1. Do not delete linked history.
ALTER TABLE users ADD COLUMN purged_at TEXT DEFAULT NULL;
CREATE INDEX IF NOT EXISTS idx_users_purged_at ON users(purged_at);
