-- SchoolHub v1.4 (additive) - per-teacher Excel import permissions.
-- Apply once AFTER a verified D1 backup, BEFORE deploying v1.4 API.
-- Default denies both features to every existing teacher.
ALTER TABLE users ADD COLUMN can_import_excel INTEGER NOT NULL DEFAULT 0 CHECK (can_import_excel IN (0,1));
ALTER TABLE users ADD COLUMN can_sync_excel INTEGER NOT NULL DEFAULT 0 CHECK (can_sync_excel IN (0,1));
