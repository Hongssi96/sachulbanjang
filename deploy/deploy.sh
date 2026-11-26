#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"

export IMAGE_TAG="${1:?usage: deploy.sh <image-tag>}"
export REGISTRY_IMAGE="${REGISTRY_IMAGE:-imleader}"
HEALTH_URL="${HEALTH_URL:-http://127.0.0.1/api/v1/health/live}"

# 서버 체크아웃을 prod 최신으로 맞춘다. 로컬 변경이 있으면 실패하는 것이 정상이다.
if [ "${SKIP_PULL:-0}" != "1" ]; then
  git -C .. fetch --quiet origin
  git -C .. checkout --quiet prod
  git -C .. pull --quiet --ff-only origin prod
fi

for image in "${REGISTRY_IMAGE}/api:${IMAGE_TAG}" "${REGISTRY_IMAGE}/web:${IMAGE_TAG}"; do
  if ! docker image inspect "$image" >/dev/null 2>&1; then
    echo "image not found: $image"
    echo "build it first or let CI build:images run"
    exit 1
  fi
done

docker compose up -d --wait --wait-timeout 180 postgres
docker compose run --rm api alembic upgrade head
docker compose up -d --wait --wait-timeout 180 --remove-orphans
docker compose ps

healthy=0
for _ in $(seq 1 30); do
  if curl -fsS "$HEALTH_URL" >/dev/null 2>&1; then
    healthy=1
    break
  fi
  sleep 2
done
if [ "$healthy" != "1" ]; then
  echo "health check failed: $HEALTH_URL"
  exit 1
fi
echo "health ok: $HEALTH_URL"
docker image prune -f
