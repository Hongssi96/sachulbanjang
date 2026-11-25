#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"

export IMAGE_TAG="${1:?usage: deploy.sh <image-tag>}"
HEALTH_URL="${HEALTH_URL:-http://127.0.0.1/api/v1/health/live}"

# 서버 체크아웃을 prod 최신으로 맞춘다. 로컬 변경이 있으면 실패하는 것이 정상이다.
if [ "${SKIP_PULL:-0}" != "1" ]; then
  git -C .. fetch --quiet origin
  git -C .. checkout --quiet prod
  git -C .. pull --quiet --ff-only origin prod
fi

if [ "${SKIP_IMAGE_PULL:-0}" != "1" ]; then
  docker compose pull
fi
docker compose up -d --wait postgres
docker compose run --rm api alembic upgrade head
docker compose up -d --remove-orphans
docker compose ps

curl -fsSL "$HEALTH_URL"
docker image prune -f
