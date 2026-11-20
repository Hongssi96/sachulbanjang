"""Establish the initial migration baseline."""

from collections.abc import Sequence

revision: str = "20261119_0001"
down_revision: str | Sequence[str] | None = None
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Record the baseline without creating unapproved business tables."""


def downgrade() -> None:
    """Remove the baseline revision marker."""
