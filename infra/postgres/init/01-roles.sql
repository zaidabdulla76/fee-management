-- Architecture NFR-1: app role with INSERT-only on Payment (no UPDATE/DELETE).
-- Owner role `fee` (POSTGRES_USER) creates schema via API bootstrap; runtime uses fee_app.

DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'fee_app') THEN
    CREATE ROLE fee_app LOGIN PASSWORD 'fee_app';
  ELSE
    ALTER ROLE fee_app WITH LOGIN PASSWORD 'fee_app';
  END IF;
END
$$;

GRANT CONNECT ON DATABASE fee TO fee_app;
GRANT USAGE ON SCHEMA public TO fee_app;
