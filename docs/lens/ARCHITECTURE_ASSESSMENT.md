# Architecture Assessment

## Overview
Lens is built as an integrated module within Hudumika, sharing its multi-tenant architecture and authentication (JWTPayload). It uses a unified Work Item model backed by Postgres (via Kysely) and a React 19 SPA frontend (Vite).

## Key Decisions
- **Unified Model**: A single `lens_items` table (or logically partitioned set of tables) handling all types (Bug, Feature, Task) to simplify queries and workflow state machines.
- **No Separate Auth**: Leverages Hudumika's existing RBAC and tenant isolation.
- **GitHub Integration**: Direct OAuth and Webhook integrations to sync PRs and commits automatically.