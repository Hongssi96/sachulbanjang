from app.security.passwords import hash_password, password_needs_rehash, verify_password


def test_password_hash_verifies_original_password() -> None:
    password_hash = hash_password("correct-password")

    assert password_hash.startswith("$argon2id$")
    assert verify_password("correct-password", password_hash)


def test_password_hash_rejects_wrong_password_and_salts_each_hash() -> None:
    password_hash = hash_password("correct-password")

    assert not verify_password("wrong-password", password_hash)
    assert hash_password("correct-password") != password_hash
    assert not password_needs_rehash(password_hash)


def test_malformed_hash_is_rejected() -> None:
    assert not verify_password("correct-password", "not-a-password-hash")
