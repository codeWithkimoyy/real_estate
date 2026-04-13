# Database Migrations

Place forward-only SQL migration files here.

Naming convention:
- `YYYYMMDD_HHMMSS_description.sql`

Example:
- `20260413_101500_add_user_indexes.sql`

Rules:
- Keep migrations idempotent when possible (`IF NOT EXISTS`, guarded updates).
- Do not edit a migration after it has been applied in shared environments.
- Create a new migration for every schema change.
