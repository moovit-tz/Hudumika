# Vehicle editing access — 21 October 2026

The existing vehicle PATCH role policy is shared between the API and profile UI using VEHICLE_EDIT_ROLES / canEditVehicle in @hudumika/types.

Allowed: SUPER_ADMIN, ADMIN, TENANT_ADMIN, MANAGER, SENIOR, JUNIOR. No new roles were granted access. Other roles do not see edit controls; the API retains its 403 enforcement independently of UI visibility. The explicit tenant filter on PATCH remains unchanged. Tracker secrets are stripped from the PATCH response.

The profile header has an Edit vehicle action. Role changes close the editor, and both entry and save handlers check access. Existing data is loaded into the inline editor; this change does not migrate or rewrite records.

Verification: targeted integration test passed (1 passed, 12 unrelated tests skipped). Checks include allowed operational roles, denied Finance/Sales roles, cross-tenant 404, invalid input 400 and no device_secret in successful responses. Browser verified the authorised editor and cancelled without saving. Design-system check passed. API and web compilation were launched; final results remain in the current command sessions/logs until completion.
