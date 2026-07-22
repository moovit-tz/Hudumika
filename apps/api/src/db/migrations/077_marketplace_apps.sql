-- Up Migration

CREATE TABLE marketplace_apps (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    developer_id UUID NOT NULL REFERENCES users(id),
    developer_name VARCHAR(255) NOT NULL,
    category VARCHAR(50) NOT NULL,
    short_desc VARCHAR(255) NOT NULL,
    long_desc TEXT NOT NULL,
    features JSONB NOT NULL DEFAULT '[]',
    permissions JSONB NOT NULL DEFAULT '[]',
    icon_url VARCHAR(1024),
    webhook_url VARCHAR(1024),
    status VARCHAR(20) NOT NULL DEFAULT 'pending', -- pending, approved, rejected
    rating NUMERIC(3,1) DEFAULT 0.0,
    reviews_count INT DEFAULT 0,
    installs VARCHAR(50) DEFAULT '0',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Initial Seed (Porting the hardcoded apps)
INSERT INTO marketplace_apps (id, name, developer_id, developer_name, category, short_desc, long_desc, features, permissions, icon_url, status, rating, reviews_count, installs)
SELECT
    gen_random_uuid(),
    'Zoom Meetings for Hudumika',
    (SELECT id FROM users LIMIT 1),
    'Zoom Video Communications',
    'communication',
    'Seamlessly schedule, start, and manage video meetings directly from Hudumika.',
    'Bring premium video conferencing into your daily workflows. Zoom for Hudumika allows you to schedule meetings with clients directly from your CRM leads, support tickets, or shipment coordination boards. Instantly generate meeting links and sync invitations to calendars.',
    '["One-click meeting creation from any lead or support case", "Automatic sync of calendar invites and reminder notifications", "High-definition video and audio conferencing integration", "Cloud recording links automatically attached to customer records"]'::JSONB,
    '["Access and manage your calendar events", "View your CRM contacts and user directory", "Send notifications on your behalf"]'::JSONB,
    NULL,
    'approved',
    4.7, 1420, '10M+';

INSERT INTO marketplace_apps (id, name, developer_id, developer_name, category, short_desc, long_desc, features, permissions, icon_url, status, rating, reviews_count, installs)
SELECT
    gen_random_uuid(),
    'DocuSign eSignature',
    (SELECT id FROM users LIMIT 1),
    'DocuSign Inc.',
    'business',
    'Sign, send, and track agreements and contracts securely within Hudumika.',
    'DocuSign is the world''s leading way to sign and manage agreements. Integrate electronic signatures into your legal, sales, and HR workflows. Send shipping contracts, customs power of attorney forms, or employment agreements for signing and track completion status in real time.',
    '["Send documents for signing directly from Cloud Storage", "Pre-populate contract fields with CRM customer data", "Secure, legally binding audit trails automatically saved", "Push notifications when documents are opened and signed"]'::JSONB,
    '["Read and write to your Cloud storage files", "Access customer contact details for envelope delivery", "Update shipment status upon signature completion"]'::JSONB,
    NULL,
    'approved',
    4.8, 980, '5M+';

INSERT INTO marketplace_apps (id, name, developer_id, developer_name, category, short_desc, long_desc, features, permissions, icon_url, status, rating, reviews_count, installs)
SELECT
    gen_random_uuid(),
    'Slack Connector',
    (SELECT id FROM users LIMIT 1),
    'Slack Technologies',
    'communication',
    'Sync shipments, operations, and support channels with Slack.',
    'Keep your team connected and informed. The Slack Connector maps ClearOS shipments, customs clearance milestones, and Bliss support tickets directly to Slack channels. Automatically broadcast status updates, alerts, and mentions to keep everyone in sync.',
    '["Broadcast customs clearance milestones to dedicated Slack channels", "Ping support agents instantly when critical tickets are escalated", "Create temporary Slack channels for specific high-value shipments", "Use Slack slash commands to query shipment status from Slack"]'::JSONB,
    '["Post messages and alerts to your Slack channels", "Read status updates from ClearOS shipments", "Link Slack user profiles with Hudumika accounts"]'::JSONB,
    NULL,
    'approved',
    4.6, 2150, '8M+';

-- Down Migration
-- DROP TABLE marketplace_apps;
