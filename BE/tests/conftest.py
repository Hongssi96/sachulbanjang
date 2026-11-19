import os

os.environ.setdefault(
    "APP_DATABASE_URL",
    "postgresql+psycopg://user:password@localhost/test_database",
)
os.environ.setdefault("APP_JWT_SECRET", "test-secret-that-is-at-least-32-characters")
