ALTER TABLE email_quick_templates
  ADD COLUMN IF NOT EXISTS category TEXT NOT NULL DEFAULT 'General';
