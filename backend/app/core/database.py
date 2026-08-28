from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, Session
from app.core.config import get_settings
from app.core.dburl import sqlalchemy_url
from app.models.entities import Base

settings = get_settings()
engine = create_engine(sqlalchemy_url(settings.database_url), pool_pre_ping=True)
SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False)


def init_db() -> None:
    Base.metadata.create_all(bind=engine)


def get_db():
    db: Session = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def rebind(url: str) -> None:
    """Rebind engine/session for bootstrap entrypoint."""
    global engine, SessionLocal, settings
    from app.core.config import get_settings as _gs

    _gs.cache_clear()
    import os

    os.environ["DATABASE_URL"] = sqlalchemy_url(url)
    settings = _gs()
    engine = create_engine(sqlalchemy_url(url), pool_pre_ping=True)
    SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False)
