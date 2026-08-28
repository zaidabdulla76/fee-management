from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    database_url: str = "postgresql+psycopg://fee:fee@localhost:5432/fee"
    jwt_secret: str = "fee-mgmt-dev-secret-change-me"
    jwt_expires_minutes: int = 60 * 12
    internal_sweep_token: str = "fee-internal-sweep-token"
    cors_origins: str = "*"


@lru_cache
def get_settings() -> Settings:
    return Settings()
