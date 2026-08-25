-- Migration 312: per-user Simple/Projects mode switch for Tasks.
ALTER TABLE user_app_settings ADD COLUMN IF NOT EXISTS tasks_mode TEXT NOT NULL DEFAULT 'simple'
  CHECK (tasks_mode IN ('simple', 'projects'));
