from __future__ import annotations

import argparse
import logging
import time

from app.core.config import get_settings
from app.db.session import create_database_engine, create_session_factory
from app.integrations.ai import OpenAiCompatibleClient
from app.services.chat_generation import ChatGenerationService

logger = logging.getLogger(__name__)


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Run the AI chat answer worker.")
    parser.add_argument("--once", action="store_true", help="Process at most one queued job.")
    parser.add_argument("--poll-seconds", type=float, default=2.0)
    return parser


def main() -> int:
    args = build_parser().parse_args()
    if args.poll_seconds <= 0:
        raise SystemExit("--poll-seconds must be greater than zero")
    settings = get_settings()
    if settings.ai_base_url is None or settings.ai_api_key is None:
        raise SystemExit("APP_AI_BASE_URL and APP_AI_API_KEY are required for the chat worker")
    engine = create_database_engine(settings.database_url)
    factory = create_session_factory(engine)
    client = OpenAiCompatibleClient(
        base_url=settings.ai_base_url,
        api_key=settings.ai_api_key.get_secret_value(),
        model=settings.ai_model,
        timeout_seconds=settings.ai_request_timeout_seconds,
    )
    try:
        while True:
            with factory() as session:
                result = ChatGenerationService(
                    session,
                    client,
                    lease_seconds=settings.report_worker_lease_seconds,
                ).process_next()
            if result is not None:
                logger.info(
                    "chat generation job finished",
                    extra={
                        "job_id": result.job_id,
                        "turn_id": result.turn_id,
                        "state": result.state,
                    },
                )
            if args.once:
                return 0
            if result is None:
                time.sleep(args.poll_seconds)
    finally:
        engine.dispose()


if __name__ == "__main__":
    raise SystemExit(main())
