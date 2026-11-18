# Hudumika Lens — Integration Provider Capability Matrix

| Provider | Auth Type | Inbound Webhooks | Signature Verification | Outbound Sync | Required Scopes / Permissions | Rate Limiting Policy | Production Status |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **GitHub** | GitHub App / PAT | Issues, PRs, Checks, Pushes, Releases | HMAC-SHA256 (`x-hub-signature-256`) | Issues, Comments, Deployments, Checks | `issues:write`, `pull_requests:read`, `checks:read`, `metadata:read` | 5,000 req/hr (App installation: 15,000 req/hr) | **Ready** (Credentials configured in `lens_connection_instances`) |
| **Jira Cloud** | OAuth 2.0 3LO | Issues, Transitions, Comments | HMAC-SHA256 (`x-atlassian-webhook-jwt` / secret) | Issues, Transitions, Links, Worklogs | `read:jira-work`, `write:jira-work`, `offline_access` | Dynamic cost-bucket rate limiter; respects `Retry-After` header | **Ready** (Distributable OAuth application) |
| **Linear** | OAuth 2.0 / API Key | Issues, Cycles, Projects, Comments | HMAC-SHA256 (`linear-signature`) | Issues, Comments, Labels, States | `read`, `write`, `issues:create`, `comments:create` | 1,500 GraphQL complexity points/min | **Ready** (GraphQL client with cursor pagination) |
| **Notion** | OAuth 2.0 / Internal Token | Database updates, Page updates | Shared secret / webhook verification | Release notes, Spec exports, Decisions | `read_content`, `insert_content`, `update_content` | 3 requests per second average | **Ready** (Block pagination & Markdown converter) |
| **Slack** | OAuth 2.0 Bot Token | Messages, Interactions, Commands | Timestamped HMAC-SHA256 v0 (`x-slack-signature`) | Channels, Incident threads, Alert webhooks | `chat:write`, `channels:read`, `commands`, `app_mentions:read` | Tier-based: 1 req/sec per channel | **Ready** (5-minute replay window & signature check) |
| **CircleCI** | API Token | Workflow runs, Job completions | Webhook signing secret | Read-only pipeline & artifact fetching | `view-builds`, `read-artifacts` | Standard API rate limit | **Ready** (Read-only pipeline evidence tracking) |
| **GitLab** | Personal / Group Access Token | Issues, Merge Requests, Pipeline events | Secret token (`x-gitlab-token`) | Issues, MRs, Release links | `api`, `read_repository`, `write_repository` | 2,000 req/min authenticated | **Candidate** (Adapter registered; connection instance schema ready) |

## Credential Encryption & Key Management
- All connection credentials, client secrets, and webhook tokens are encrypted at rest using AES-256-GCM via `lens-crypto.service.ts`.
- Encrypted payloads are stored in `lens_connection_instances.credentials_encrypted` alongside a 96-bit initialization vector (`credentials_iv`) and a 128-bit authentication tag (`credentials_tag`).
- Masked previews (e.g. `ghp_************abc1`) are derived deterministically for frontend displays; raw secret material is never returned across the wire.
- Webhook endpoints enforce constant-time signature comparison (`timingSafeEqual`) to prevent timing attacks.
