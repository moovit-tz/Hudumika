# Testing Strategy

- **Type Checking**: Strict TypeScript compiler checks (`npm run typecheck`).
- **Unit Tests**: Test utility functions and workflow rule logic using Vitest.
- **Integration Tests**: Verify API endpoints against a local Postgres test database, ensuring tenant isolation prevents cross-tenant data leaks.
- **Manual QA**: Verify UI interactions across the List and Board views.