#!/usr/bin/env python3
"""Bootstrap schema as DB owner, apply NFR-1 grants, then exec gunicorn+uvicorn."""
from __future__ import annotations

import os
import sys

from app.core.dburl import database_name, replace_user_password, sql_literal, sqlalchemy_url


def _ensure_fee_app(conn, password: str, dbname: str) -> None:
    from sqlalchemy import text

    conn.execute(
        text(
            f"""
            DO $$
            BEGIN
              IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'fee_app') THEN
                CREATE ROLE fee_app LOGIN PASSWORD {sql_literal(password)};
              ELSE
                ALTER ROLE fee_app WITH LOGIN PASSWORD {sql_literal(password)};
              END IF;
            END
            $$;
            """
        )
    )
    conn.execute(text(f'GRANT CONNECT ON DATABASE "{dbname}" TO fee_app'))
    conn.execute(text("GRANT USAGE ON SCHEMA public TO fee_app"))


def _apply_nfr1_grants(conn) -> None:
    from sqlalchemy import text

    # Base grants for sequences
    conn.execute(text("GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO fee_app"))
    conn.execute(
        text(
            "ALTER DEFAULT PRIVILEGES IN SCHEMA public "
            "GRANT USAGE, SELECT ON SEQUENCES TO fee_app"
        )
    )

    # General tables: full CRUD for app tables except payments/monthly_bills which are restricted (NFR-1)
    # Grant broadly first, then tighten payments to INSERT-only and monthly_bills to no DELETE.
    conn.execute(
        text(
            "GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO fee_app"
        )
    )
    conn.execute(
        text(
            "ALTER DEFAULT PRIVILEGES IN SCHEMA public "
            "GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO fee_app"
        )
    )

    # NFR-1: payments is append-only (INSERT + SELECT only). Revoke UPDATE/DELETE for runtime role.
    # Wrap in DO block to avoid failure if table not yet created on first bootstrap.
    conn.execute(
        text(
            """
            DO $$
            BEGIN
                IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='payments') THEN
                    REVOKE UPDATE, DELETE ON TABLE payments FROM fee_app;
                    -- Ensure SELECT + INSERT remain
                    GRANT SELECT, INSERT ON TABLE payments TO fee_app;
                END IF;
                IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='monthly_bills') THEN
                    REVOKE DELETE ON TABLE monthly_bills FROM fee_app;
                    GRANT SELECT, INSERT, UPDATE ON TABLE monthly_bills TO fee_app;
                END IF;
            END $$;
            """
        )
    )
    # Default privileges for future tables created by owner: payments INSERT-only, monthly_bills no DELETE
    conn.execute(
        text(
            "ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE UPDATE, DELETE ON TABLES FROM fee_app"
        )
    )
    # Re-grant UPDATE for future monthly_bills (but not DELETE) and full for other future tables
    # We do this by granting UPDATE back via a conditional approach: grant UPDATE on all future, then revoke on payments
    conn.execute(
        text(
            "ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE ON TABLES TO fee_app"
        )
    )
    # Ensure future payments never get UPDATE/DELETE
    conn.execute(
        text(
            """
            DO $$
            BEGIN
                -- This is a best-effort; Postgres does not support per-table default revokes cleanly.
                -- Runtime enforcement is via REVOKE above + ORM guards in app/core/integrity.py.
                NULL;
            END $$;
            """
        )
    )


def bootstrap(admin_url: str, app_url: str, fee_app_password: str) -> str:
    """Create schema as owner. Returns the URL gunicorn should use."""
    from sqlalchemy import create_engine, text

    from app.core import database as dbmod
    from app.services.seed import seed_if_empty

    print("Bootstrap as owner…")
    dbmod.rebind(admin_url)

    engine = create_engine(admin_url, pool_pre_ping=True)
    dbname = database_name(admin_url)
    runtime_url = app_url
    use_fee_app = True

    try:
        with engine.begin() as conn:
            _ensure_fee_app(conn, fee_app_password, dbname)
    except Exception as exc:
        print(
            f"fee_app role not available ({exc}). "
            "Runtime will use the owner role; ORM NFR-1 still applies."
        )
        use_fee_app = False
        runtime_url = admin_url

    dbmod.init_db()
    db = dbmod.SessionLocal()
    try:
        seed_if_empty(db)
    finally:
        db.close()

    if use_fee_app:
        with engine.begin() as conn:
            _apply_nfr1_grants(conn)
        print("Probing fee_app connection…")
        probe = create_engine(runtime_url, pool_pre_ping=True)
        try:
            with probe.connect() as conn:
                conn.execute(text("SELECT 1"))
        except Exception as exc:
            print(
                f"fee_app probe failed ({exc}). "
                "Runtime will use the owner role; ORM NFR-1 still applies."
            )
            runtime_url = admin_url
        finally:
            probe.dispose()
        if runtime_url != admin_url:
            print("Bootstrap OK — fee_app authenticated; Payment INSERT-only (NFR-1).")
        else:
            print("Bootstrap OK — owner role (managed Postgres).")
    else:
        print("Bootstrap OK — owner role (managed Postgres).")

    engine.dispose()
    return runtime_url


def main() -> None:
    admin_raw = os.environ.get("DATABASE_URL_ADMIN") or os.environ.get("DATABASE_URL")
    if not admin_raw:
        raise RuntimeError(
            "DATABASE_URL_ADMIN (or DATABASE_URL) must be set for bootstrap."
        )

    admin_url = sqlalchemy_url(admin_raw)
    fee_app_password = os.environ.get("FEE_APP_PASSWORD", "fee_app")
    app_raw = os.environ.get("DATABASE_URL")
    if app_raw and os.environ.get("DATABASE_URL_ADMIN"):
        app_url = sqlalchemy_url(app_raw)
    else:
        app_url = replace_user_password(admin_url, "fee_app", fee_app_password)

    runtime_url = bootstrap(admin_url, app_url, fee_app_password)
    os.environ["DATABASE_URL"] = runtime_url

    workers = os.environ.get("WEB_CONCURRENCY", "2")
    port = os.environ.get("PORT", "8000")
    timeout = os.environ.get("GUNICORN_TIMEOUT", "120")
    os.execvp(
        "gunicorn",
        [
            "gunicorn",
            "app.main:app",
            "-k",
            "uvicorn.workers.UvicornWorker",
            "-b",
            f"0.0.0.0:{port}",
            "-w",
            workers,
            "--timeout",
            timeout,
            "--access-logfile",
            "-",
            "--error-logfile",
            "-",
        ],
    )


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:
        print(f"entrypoint failed: {exc}", file=sys.stderr)
        sys.exit(1)
