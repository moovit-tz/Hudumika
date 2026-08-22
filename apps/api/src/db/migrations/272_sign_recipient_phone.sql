-- Sign M3: optional recipient phone number, for WhatsApp delivery of the
-- signing link alongside email (matching the dual-channel pattern
-- shipment-report.service.ts already established) and, later, SMS OTP (M4).
ALTER TABLE sign_recipients ADD COLUMN IF NOT EXISTS phone TEXT;
