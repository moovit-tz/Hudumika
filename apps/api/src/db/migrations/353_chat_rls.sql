-- chat_channels/chat_messages/chat_channel_members/chat_message_reactions
-- (074_chat.sql) shipped with zero RLS — a real gap, not a style nit
-- (CLAUDE.md): every RLS-enabled table must carry FORCE ROW LEVEL SECURITY
-- plus the standard tenant_isolation_policy. Found while wiring real
-- favorite persistence and a browse/join UI on top of this same schema.
-- chat_channels and chat_messages carry tenant_id directly; chat_channel_members
-- and chat_message_reactions don't (they key off channel_id/message_id), so
-- their policy joins back to the tenant-scoped parent table instead.

ALTER TABLE chat_channels ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_channels FORCE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polname = 'tenant_isolation_policy' AND polrelid = 'chat_channels'::regclass) THEN
    CREATE POLICY tenant_isolation_policy ON chat_channels
      USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
  END IF;
END $$;

ALTER TABLE chat_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_messages FORCE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polname = 'tenant_isolation_policy' AND polrelid = 'chat_messages'::regclass) THEN
    CREATE POLICY tenant_isolation_policy ON chat_messages
      USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
  END IF;
END $$;

ALTER TABLE chat_channel_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_channel_members FORCE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polname = 'tenant_isolation_policy' AND polrelid = 'chat_channel_members'::regclass) THEN
    CREATE POLICY tenant_isolation_policy ON chat_channel_members
      USING (channel_id IN (SELECT id FROM chat_channels WHERE tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid));
  END IF;
END $$;

ALTER TABLE chat_message_reactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_message_reactions FORCE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polname = 'tenant_isolation_policy' AND polrelid = 'chat_message_reactions'::regclass) THEN
    CREATE POLICY tenant_isolation_policy ON chat_message_reactions
      USING (message_id IN (SELECT id FROM chat_messages WHERE tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid));
  END IF;
END $$;
