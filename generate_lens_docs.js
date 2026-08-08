const fs = require('fs');
const path = require('path');

const DIR = path.join(__dirname, 'docs', 'lens');
fs.mkdirSync(DIR, { recursive: true });

const files = {
  'README.md': `# Lens\n\nLens is a native Hudumika workspace application designed to unify product and engineering execution. It tracks work across features, ideas, bugs, technical debt, tasks, requests, security, documentation, DevOps, epics/projects, releases, and dependencies with deep GitHub integration.`,
  
  'ARCHITECTURE_ASSESSMENT.md': `# Architecture Assessment\n\n## Overview\nLens is built as an integrated module within Hudumika, sharing its multi-tenant architecture and authentication (JWTPayload). It uses a unified Work Item model backed by Postgres (via Kysely) and a React 19 SPA frontend (Vite).\n\n## Key Decisions\n- **Unified Model**: A single \`lens_items\` table (or logically partitioned set of tables) handling all types (Bug, Feature, Task) to simplify queries and workflow state machines.\n- **No Separate Auth**: Leverages Hudumika's existing RBAC and tenant isolation.\n- **GitHub Integration**: Direct OAuth and Webhook integrations to sync PRs and commits automatically.`,
  
  'ARCHITECTURE.md': `# Architecture\n\n## Frontend\n- **Stack**: React 19, React Router v6, Vite, Tailwind v4.\n- **Components**: Utilizes the Hudumika \`@hudumika/ui\` design system (shadcn/Radix).\n\n## Backend\n- **Stack**: Fastify, Kysely, Postgres.\n- **Endpoints**: Prefixed under \`/v1/lens/\`.\n- **Isolation**: Every query enforces \`.where('tenant_id', '=', req.user.tenant_id)\`.`,
  
  'DATA_MODEL.md': `# Data Model\n\n## Core Entities\n- **LensItem**: The base entity representing a unit of work.\n  - \`id\` (UUID, PK)\n  - \`tenant_id\` (UUID, FK, required)\n  - \`kind\` (Enum: IDEA, FEATURE, BUG, IMPROVEMENT, TASK, TECH_DEBT, SECURITY, DOCS, DEVOPS, EPIC)\n  - \`status\` (Enum: IDEA, BACKLOG, PLANNED, IN_PROGRESS, IN_REVIEW, TESTING, DONE, RELEASED, CANCELLED)\n  - \`title\`, \`description\`, \`priority\`, \`assignee_id\`, \`reporter_id\`\n- **LensItemHistory**: Audit log of all changes to a LensItem.\n- **LensIntegration**: Configuration for third-party tools (GitHub, Slack, etc.).`,
  
  'WORKFLOWS.md': `# Workflows & State Modeling\n\n## Status Lifecycle\n1. \`IDEA\` (Triage)\n2. \`BACKLOG\` (Unplanned)\n3. \`PLANNED\` (Scheduled for upcoming cycle)\n4. \`IN_PROGRESS\` (Actively being worked on)\n5. \`IN_REVIEW\` (PR open, awaiting review)\n6. \`TESTING\` (QA/Verification)\n7. \`DONE\` (Merged/Completed)\n8. \`RELEASED\` (Deployed to production)\n\n## Terminal States\n- \`REJECTED\`, \`DUPLICATE\`, \`CANCELLED\`, \`WONT_FIX\``,
  
  'GITHUB_INTEGRATION.md': `# GitHub Integration\n\n## Capabilities\n- **Branch Tracking**: Link branches to Lens items.\n- **PR Sync**: Automatically transition items to \`IN_REVIEW\` when a linked PR is opened.\n- **Merge Sync**: Automatically transition items to \`DONE\` when a linked PR is merged.\n- **CI Status**: Display GitHub Actions build status directly on the Lens item.\n\n## Webhooks\nLens listens for GitHub webhooks at \`/v1/lens/webhooks/github\` to process \`pull_request\` and \`push\` events in real-time.`,
  
  'AUTOMATIONS.md': `# Automations\n\nLens includes a lightweight rules engine to automate workflows.\n\n## Example Rules\n- **Trigger**: GitHub PR Merged -> **Action**: Move item to \`DONE\`.\n- **Trigger**: Item moved to \`IN_PROGRESS\` -> **Action**: Assign to current user if unassigned.\n- **Trigger**: High priority bug created -> **Action**: Send Slack notification to #engineering.`,
  
  'API.md': `# API Design\n\nAll endpoints require a valid Hudumika JWT.\n\n- \`GET /v1/lens/items\` - List items (with filtering: q, kind, area, status)\n- \`POST /v1/lens/items\` - Create a new item\n- \`PATCH /v1/lens/items/:id\` - Update an item (status, assignment, etc.)\n- \`GET /v1/lens/board\` - Fetch Kanban board layout data\n- \`GET /v1/lens/integrations\` - List configured integrations\n- \`PUT /v1/lens/integrations/:provider\` - Save integration credentials`,
  
  'SECURITY.md': `# Security\n\n## Tenant Isolation\nEvery row in Lens tables must include \`tenant_id\`. All API queries must explicitly include \`where('tenant_id', '=', req.user.tenant_id)\`. **RLS** (Row Level Security) is enabled as a defense-in-depth measure, but application-level scoping is mandatory.\n\n## Credentials\nThird-party tokens (e.g., GitHub PATs) must be encrypted at rest using AES-256-GCM. Never log raw tokens.`,
  
  'TESTING.md': `# Testing Strategy\n\n- **Type Checking**: Strict TypeScript compiler checks (\`npm run typecheck\`).\n- **Unit Tests**: Test utility functions and workflow rule logic using Vitest.\n- **Integration Tests**: Verify API endpoints against a local Postgres test database, ensuring tenant isolation prevents cross-tenant data leaks.\n- **Manual QA**: Verify UI interactions across the List and Board views.`,
  
  'DEPLOYMENT.md': `# Deployment\n\nLens is deployed as part of the monolithic Hudumika build pipeline.\n- **Database**: Migrations run automatically during \`npm run db:migrate\`.\n- **API**: Hosted as part of the Fastify server cluster.\n- **Frontend**: Bundled into the Vite static output and served via CDN/Nginx.`,
  
  'IMPLEMENTATION_STATUS.md': `# Implementation Status\n\n## Phase 0: Discovery\n- [x] Documentation Deliverables\n\n## Phase 1: Foundation\n- [ ] Database Schema\n- [ ] Core CRUD APIs\n\n## Phase 2: Core Tracking\n- [x] List View UI\n- [x] Board View UI\n- [ ] API Integration\n\n## Phase 5: GitHub\n- [x] Integrations UI\n- [ ] OAuth/Webhook logic`
};

for (const [filename, content] of Object.entries(files)) {
  fs.writeFileSync(path.join(DIR, filename), content);
  console.log(`Created ${filename}`);
}
