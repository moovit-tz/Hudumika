# Data Model

## Core Entities
- **LensItem**: The base entity representing a unit of work.
  - `id` (UUID, PK)
  - `tenant_id` (UUID, FK, required)
  - `kind` (Enum: IDEA, FEATURE, BUG, IMPROVEMENT, TASK, TECH_DEBT, SECURITY, DOCS, DEVOPS, EPIC)
  - `status` (Enum: IDEA, BACKLOG, PLANNED, IN_PROGRESS, IN_REVIEW, TESTING, DONE, RELEASED, CANCELLED)
  - `title`, `description`, `priority`, `assignee_id`, `reporter_id`
- **LensItemHistory**: Audit log of all changes to a LensItem.
- **LensIntegration**: Configuration for third-party tools (GitHub, Slack, etc.).