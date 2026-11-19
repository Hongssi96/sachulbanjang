import pytest
from app.core.config import Settings
from pydantic import ValidationError


def test_required_settings_are_validated(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("APP_DATABASE_URL")
    monkeypatch.delenv("APP_JWT_SECRET")

    with pytest.raises(ValidationError):
        Settings(_env_file=None)


def test_ai_key_is_optional() -> None:
    settings = Settings(
        _env_file=None,
        database_url="postgresql+psycopg://user:password@localhost/database",
        jwt_secret="x" * 32,
    )

    assert settings.ai_api_key is None
