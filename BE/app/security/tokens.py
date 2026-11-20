from __future__ import annotations

import hashlib
import secrets
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta

import jwt
from jwt import ExpiredSignatureError, InvalidTokenError

ALGORITHM = "HS256"


class TokenError(ValueError):
    """Raised when a token is malformed, forged, or of the wrong type."""


class TokenExpiredError(TokenError):
    """Raised when a correctly formed token is past its expiry."""


@dataclass(frozen=True)
class AccessTokenClaims:
    user_id: int
    session_id: int
    role: str


@dataclass(frozen=True)
class RefreshTokenClaims:
    user_id: int
    session_id: int
    generation: int


def _decode(token: str, secret: str) -> dict[str, object]:
    try:
        payload = jwt.decode(
            token,
            secret,
            algorithms=[ALGORITHM],
            options={"require": ["exp", "iat", "sub", "sid", "type"]},
        )
    except ExpiredSignatureError as exc:
        raise TokenExpiredError("token expired") from exc
    except InvalidTokenError as exc:
        raise TokenError("invalid token") from exc
    return payload


def _subject_int(payload: dict[str, object], key: str) -> int:
    value = payload.get(key)
    if isinstance(value, bool) or not isinstance(value, (int, str)):
        raise TokenError(f"invalid token claim: {key}")
    try:
        return int(value)
    except ValueError as exc:
        raise TokenError(f"invalid token claim: {key}") from exc


def create_access_token(
    *,
    user_id: int,
    session_id: int,
    role: str,
    secret: str,
    ttl_seconds: int,
    now: datetime | None = None,
) -> str:
    issued_at = now or datetime.now(UTC)
    payload = {
        "sub": str(user_id),
        "sid": str(session_id),
        "role": role,
        "type": "access",
        "iat": issued_at,
        "exp": issued_at + timedelta(seconds=ttl_seconds),
    }
    return jwt.encode(payload, secret, algorithm=ALGORITHM)


def decode_access_token(token: str, *, secret: str) -> AccessTokenClaims:
    payload = _decode(token, secret)
    if payload.get("type") != "access":
        raise TokenError("not an access token")
    role = payload.get("role")
    if not isinstance(role, str):
        raise TokenError("invalid token claim: role")
    return AccessTokenClaims(
        user_id=_subject_int(payload, "sub"),
        session_id=_subject_int(payload, "sid"),
        role=role,
    )


def create_refresh_token(
    *,
    user_id: int,
    session_id: int,
    generation: int,
    expires_at: datetime,
    secret: str,
    now: datetime | None = None,
) -> str:
    issued_at = now or datetime.now(UTC)
    payload = {
        "sub": str(user_id),
        "sid": str(session_id),
        "gen": generation,
        "type": "refresh",
        "jti": secrets.token_urlsafe(16),
        "iat": issued_at,
        "exp": expires_at,
    }
    return jwt.encode(payload, secret, algorithm=ALGORITHM)


def decode_refresh_token(token: str, *, secret: str) -> RefreshTokenClaims:
    payload = _decode(token, secret)
    if payload.get("type") != "refresh":
        raise TokenError("not a refresh token")
    return RefreshTokenClaims(
        user_id=_subject_int(payload, "sub"),
        session_id=_subject_int(payload, "sid"),
        generation=_subject_int(payload, "gen"),
    )


def digest_token(token: str) -> str:
    """Return the SHA-256 digest stored in refresh_credential.token_digest."""
    return hashlib.sha256(token.encode("utf-8")).hexdigest()
