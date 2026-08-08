# API Design

All endpoints require a valid Hudumika JWT.

- `GET /v1/lens/items` - List items (with filtering: q, kind, area, status)
- `POST /v1/lens/items` - Create a new item
- `PATCH /v1/lens/items/:id` - Update an item (status, assignment, etc.)
- `GET /v1/lens/board` - Fetch Kanban board layout data
- `GET /v1/lens/integrations` - List configured integrations
- `PUT /v1/lens/integrations/:provider` - Save integration credentials