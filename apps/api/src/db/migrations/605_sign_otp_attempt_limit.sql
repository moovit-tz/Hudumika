-- ES-09: per-token OTP attempt counter to prevent brute-force guessing.
ALTER TABLE sign_recipients ADD COLUMN IF NOT EXISTS otp_attempts INTEGER NOT NULL DEFAULT 0;
