# Deploying this package to Render

This project uses a Render Node web service and PostgreSQL (`render.yaml`). The ZIP includes a consistent SQLite snapshot at `data/inel-rm.db` so existing inventory and plan data can be migrated.

1. Create a PostgreSQL database in Render.
2. Before the web service starts for the first time, migrate the SQLite snapshot into PostgreSQL. From your computer, use the database's **External Database URL** in a local `.env` file (`DATABASE_URL=...`), run `npm ci`, then `npm run db:migrate:supabase`. External access must be enabled for that URL. If you cannot use an external URL, run the migration command from a Render environment that can reach the database before starting the web service.
3. Create a Blueprint from `render.yaml`. Set the web service's `DATABASE_URL` to the database's **Internal Database URL**, and keep `PERSISTENCE_MODE=postgres-sync` enabled.
4. Set `INEL_ADMIN_PASSWORD` in Render before first startup to choose the initial admin password. Existing local login accounts/sessions are not copied by the migration script; the app seeds its default accounts when PostgreSQL has no users. The `.env` file is intentionally not included; enter secrets only in Render's environment settings.

Migrate before the first app startup against an empty PostgreSQL database. The app hydrates its SQLite cache from PostgreSQL at startup, so deploying against an empty database makes the hosted app appear empty.
