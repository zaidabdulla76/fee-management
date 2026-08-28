"""Normalize Postgres URLs for SQLAlchemy/psycopg and managed hosts (Render)."""
from __future__ import annotations

import os
import re
from urllib.parse import quote, urlparse, urlunparse

_DB_NAME = re.compile(r"^[A-Za-z_][A-Za-z0-9_]*$")


def sqlalchemy_url(url: str) -> str:
    """Accept postgres:// or postgresql://; emit postgresql+psycopg://.

    On Render, require TLS. Local Docker Postgres has no SSL.
    """
    raw = (url or "").strip()
    if not raw:
        return raw
    if raw.startswith("postgres://"):
        raw = "postgresql://" + raw[len("postgres://") :]
    if raw.startswith("postgresql://") and "+psycopg" not in raw.split("://", 1)[0]:
        raw = "postgresql+psycopg://" + raw[len("postgresql://") :]

    if os.environ.get("RENDER") and "sslmode=" not in raw:
        joiner = "&" if "?" in raw else "?"
        raw = f"{raw}{joiner}sslmode=require"
    return raw


def parse_postgres(url: str):
    """urlparse() needs a standard scheme; strip the +psycopg driver."""
    normalized = sqlalchemy_url(url).replace("postgresql+psycopg://", "postgresql://", 1)
    return urlparse(normalized)


def database_name(url: str) -> str:
    name = (parse_postgres(url).path or "/").lstrip("/").split("/")[0]
    if not _DB_NAME.match(name):
        raise ValueError(f"Unsafe database name in URL: {name!r}")
    return name


def replace_user_password(url: str, user: str, password: str) -> str:
    parsed = parse_postgres(url)
    host = parsed.hostname or "localhost"
    port = f":{parsed.port}" if parsed.port else ""
    netloc = f"{quote(user, safe='')}:{quote(password, safe='')}@{host}{port}"
    rebuilt = urlunparse(
        (
            "postgresql",
            netloc,
            parsed.path,
            parsed.params,
            parsed.query,
            parsed.fragment,
        )
    )
    return sqlalchemy_url(rebuilt)


def sql_literal(value: str) -> str:
    return "'" + value.replace("'", "''") + "'"
