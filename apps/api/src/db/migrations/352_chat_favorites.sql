-- Chat.tsx's favorite-star toggle (toggleFav) only ever updated local React
-- state — chat_channel_members had no column to persist it, so GET
-- /v1/chat/channels never returned is_favorite and every favorite silently
-- reverted on the next 6s poll. Per-user, so it lives on the membership row
-- (074_chat.sql), not on chat_channels itself.
ALTER TABLE chat_channel_members ADD COLUMN IF NOT EXISTS is_favorite BOOLEAN NOT NULL DEFAULT false;
