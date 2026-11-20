from datetime import UTC, datetime, timedelta

import pytest
from app.security.tokens import (
    AccessTokenClaims,
    RefreshTokenClaims,
    TokenError,
    TokenExpiredError,
    create_access_token,
    create_refresh_token,
    decode_access_token,
    decode_refresh_token,
    digest_token,
)

SECRET = "test-secret-that-is-at-least-32-characters"
NOW = datetime.now(UTC) - timedelta(seconds=5)


def test_access_token_round_trip() -> None:
    token = create_access_token(
        user_id=1, session_id=2, role="worker", secret=SECRET, ttl_seconds=900, now=NOW
    )

    assert decode_access_token(token, secret=SECRET) == AccessTokenClaims(
        user_id=1, session_id=2, role="worker"
    )


def test_expired_access_token_is_rejected() -> None:
    token = create_access_token(
        user_id=1,
        session_id=2,
        role="worker",
        secret=SECRET,
        ttl_seconds=60,
        now=NOW - timedelta(hours=1),
    )

    with pytest.raises(TokenExpiredError):
        decode_access_token(token, secret=SECRET)


def test_token_signed_with_another_secret_is_rejected() -> None:
    token = create_access_token(
        user_id=1, session_id=2, role="admin", secret=SECRET, ttl_seconds=900, now=NOW
    )

    with pytest.raises(TokenError):
        decode_access_token(token, secret="another-secret-that-is-32-characters")


def test_refresh_token_round_trip_and_type_separation() -> None:
    token = create_refresh_token(
        user_id=1,
        session_id=2,
        generation=3,
        expires_at=NOW + timedelta(days=7),
        secret=SECRET,
        now=NOW,
    )

    assert decode_refresh_token(token, secret=SECRET) == RefreshTokenClaims(
        user_id=1, session_id=2, generation=3
    )
    with pytest.raises(TokenError, match="not an access token"):
        decode_access_token(token, secret=SECRET)


def test_digest_hides_refresh_token_but_identifies_it() -> None:
    token = create_refresh_token(
        user_id=1,
        session_id=2,
        generation=1,
        expires_at=NOW + timedelta(days=7),
        secret=SECRET,
        now=NOW,
    )

    digest = digest_token(token)

    assert digest == digest_token(token)
    assert len(digest) == 64
    assert token not in digest
