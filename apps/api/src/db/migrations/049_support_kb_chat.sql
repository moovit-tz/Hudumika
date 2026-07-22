-- Add Knowledge Base Categories Table
CREATE TABLE IF NOT EXISTS kb_categories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Update Knowledge Base Table
ALTER TABLE knowledge_base ADD COLUMN IF NOT EXISTS category_id UUID REFERENCES kb_categories(id) ON DELETE SET NULL;
ALTER TABLE knowledge_base ADD COLUMN IF NOT EXISTS status VARCHAR(50) DEFAULT 'Draft';
ALTER TABLE knowledge_base ADD COLUMN IF NOT EXISTS views INTEGER DEFAULT 0;

-- Live Chat Sessions
CREATE TABLE IF NOT EXISTS live_chat_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    customer_id UUID REFERENCES customers(id) ON DELETE SET NULL,
    visitor_name VARCHAR(255),
    status VARCHAR(50) DEFAULT 'waiting', -- waiting, active, closed
    assigned_to UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Live Chat Messages
CREATE TABLE IF NOT EXISTS live_chat_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    session_id UUID NOT NULL REFERENCES live_chat_sessions(id) ON DELETE CASCADE,
    sender_type VARCHAR(50) NOT NULL, -- 'visitor' or 'agent'
    sender_id UUID, -- could be user_id or visitor_id
    content TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_kb_tenant ON kb_categories(tenant_id);
CREATE INDEX IF NOT EXISTS idx_lcs_tenant ON live_chat_sessions(tenant_id);
CREATE INDEX IF NOT EXISTS idx_lcm_session ON live_chat_messages(session_id);
