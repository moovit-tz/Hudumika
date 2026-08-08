# Architecture

## Frontend
- **Stack**: React 19, React Router v6, Vite, Tailwind v4.
- **Components**: Utilizes the Hudumika `@hudumika/ui` design system (shadcn/Radix).

## Backend
- **Stack**: Fastify, Kysely, Postgres.
- **Endpoints**: Prefixed under `/v1/lens/`.
- **Isolation**: Every query enforces `.where('tenant_id', '=', req.user.tenant_id)`.