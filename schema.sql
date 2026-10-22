CREATE TABLE IF NOT EXISTS upload_access (
  user_id TEXT PRIMARY KEY,
  granted_by TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS lmu_schedule_cache (
  cache_key TEXT PRIMARY KEY,
  payload TEXT NOT NULL,
  fetched_at TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS upload_sessions (
  session_id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  category TEXT NOT NULL,
  vehicle TEXT NOT NULL,
  total_files INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS upload_jobs (
  job_id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  category TEXT NOT NULL,
  vehicle TEXT NOT NULL,
  file_name TEXT NOT NULL,
  file_size INTEGER NOT NULL,
  sha256 TEXT,
  r2_key TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'waiting',
  attempts INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  last_status_code INTEGER,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  completed_at TEXT,
  UNIQUE(session_id, file_name)
);

CREATE INDEX IF NOT EXISTS idx_upload_jobs_session ON upload_jobs(session_id);
CREATE INDEX IF NOT EXISTS idx_upload_jobs_status ON upload_jobs(status);

CREATE TABLE IF NOT EXISTS setup_lifecycle (
  category TEXT NOT NULL,
  vehicle TEXT NOT NULL,
  file_name TEXT NOT NULL,
  file_sha TEXT NOT NULL,
  outdated INTEGER NOT NULL DEFAULT 0 CHECK (outdated IN (0, 1)),
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (category, vehicle, file_name)
);

CREATE TABLE IF NOT EXISTS setup_display_names (
  category TEXT NOT NULL,
  vehicle TEXT NOT NULL,
  file_name TEXT NOT NULL,
  file_sha TEXT NOT NULL,
  display_name TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (category, vehicle, file_name)
);

CREATE TABLE IF NOT EXISTS bug_report_limits (
  user_id TEXT PRIMARY KEY,
  last_attempt_at INTEGER NOT NULL,
  report_id TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('sending', 'sent', 'failed'))
);
