from functools import lru_cache
from typing import Literal

from pydantic import Field, SecretStr
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Validate process configuration at application startup."""

    model_config = SettingsConfigDict(
        env_file=".env",
        env_prefix="APP_",
        extra="ignore",
        case_sensitive=False,
    )

    env: Literal["development", "test", "production"] = "development"
    log_level: Literal["DEBUG", "INFO", "WARNING", "ERROR", "CRITICAL"] = "INFO"
    database_url: str = Field(min_length=1)
    jwt_secret: SecretStr = Field(min_length=32)
    ai_base_url: str | None = None
    ai_api_key: SecretStr | None = None
    ai_model: str = Field(default="gpt-6.2-sol", min_length=1)
    access_token_ttl_seconds: int = Field(default=900, ge=1)
    refresh_token_ttl_seconds: int = Field(default=604800, ge=1)
    login_max_failures: int = Field(default=5, ge=1)
    login_lock_seconds: int = Field(default=300, ge=1)
    access_cookie_name: str = Field(default="imleader_access_token", min_length=1)
    refresh_cookie_name: str = Field(default="imleader_refresh_token", min_length=1)
    csrf_cookie_name: str = Field(default="imleader_csrf_token", min_length=1)
    refresh_reuse_grace_seconds: int = Field(default=10, ge=0)
    temporary_password_ttl_seconds: int = Field(default=86400, ge=1)
    auth_cookie_secure: bool = False
    cors_origins: list[str] = Field(default_factory=list)


@lru_cache
def get_settings() -> Settings:
    return Settings()
