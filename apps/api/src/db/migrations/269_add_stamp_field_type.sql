-- Migration 269: Add stamp field type to sign_field_type enum
ALTER TYPE sign_field_type ADD VALUE IF NOT EXISTS 'stamp';
