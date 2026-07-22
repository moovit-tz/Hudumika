-- Migration: Add extra fields to contacts table matching Eyris Customer Overview
ALTER TABLE contacts
  ADD COLUMN website VARCHAR(255),
  ADD COLUMN location VARCHAR(255),
  ADD COLUMN industry VARCHAR(100),
  ADD COLUMN company_size VARCHAR(50),
  ADD COLUMN sales_owner VARCHAR(255),
  ADD COLUMN last_contacted_at TIMESTAMP WITH TIME ZONE;
