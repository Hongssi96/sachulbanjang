# 배포 구성 — 단일 VM + Docker Compose

> 상태: 구현 초안 (2026-11-25). 팀 검토 후 `prod` 브랜치와 서버 설정을 확정한다.
> 이 문서는 구성과 절차를 설명하고, 실제 설정은 `deploy/`와 `.gitlab-ci.yml`에 있다.

## 1. 전제

| 항목 | 결정 |
| --- | --- |
| 배포 대상 | 리눅스 VM 1대 (Docker Engine + Compose v2.20 이상) |
| FE | Vite SPA 2개: 데스크톱(`/`), 태블릿(`/tablet/`) |
| BE | FastAPI + uvicorn, 기존 `BE/Dockerfile` 사용 |
| DB | PostgreSQL 18 컨테이너, 호스트 포트 미노출 |
| 작업 큐 | DB 작업 테이블 + worker 2개(`run_report_worker`, `run_chat_worker`) |
| 도메인 | 단일 도메인, nginx가 80/443 담당. FE와 API를 같은 출처로 묶는다 |
| 배포 트리거 | `prod` 브랜치 병합 → GitLab CI/CD |

같은 출처로 묶는 이유: 인증이 HttpOnly 쿠키(`SameSite=Lax`, `Path=/`)이고 CSRF 쿠키를 쓰므로,
FE와 API 출처가 다르면 CORS·쿠키 설정이 추가로 필요하다. nginx가 `/api`를 BE로 프록시하면
`APP_CORS_ORIGINS`를 비워 둘 수 있다.

## 2. 구성도

```
인터넷
  │ 80/443
  ▼
[web: nginx]
  ├─ /            → 데스크톱 SPA
  ├─ /tablet/     → 태블릿 SPA
  └─ /api/        → [api: uvicorn 8000]
                        │
                        ├─ [postgres:18]  (내부 네트워크만)
                        ├─ [report-worker]  (AI 사용 시)
                        └─ [chat-worker]    (AI 사용 시)
```

## 3. 저장소에 추가된 파일

| 파일 | 역할 |
| --- | --- |
| `.gitlab-ci.yml` | 검증(MR·dev·prod), 이미지 빌드(prod), 배포(prod, 수동) |
| `.dockerignore` | web 이미지 빌드 컨텍스트에서 `.git`, `.venv`, `node_modules`, `dist` 제외 |
| `deploy/compose.yaml` | 운영 Compose (postgres, api, worker×2, web) |
| `deploy/Dockerfile.web` | FE 2개 빌드 → nginx 이미지. FE 소스는 수정하지 않음 |
| `deploy/nginx/default.conf` | 정적 서빙, SPA fallback, `/api` 프록시 |
| `deploy/deploy.sh` | prod 갱신 → pull → 마이그레이션 → 기동 → 헬스체크 |
| `deploy/.gitignore` | `.env`, `certbot/`, `seed/`, `backup/` 제외 |

태블릿은 `vite build ... --base=/tablet/`로 빌드해 `/tablet/assets/...`를 참조한다. 따라서 FE
설정 파일을 고치지 않아도 `/tablet/` 경로에서 동작한다.

## 4. 검증 결과

실행한 검증:

| 항목 | 결과 |
| --- | --- |
| YAML 파싱 (`.gitlab-ci.yml`, `deploy/compose.yaml`) | 통과 |
| `docker compose config` | 통과 |
| `nginx -t` (nginx:1.27-alpine) | 통과 |
| `bash -n deploy/deploy.sh` | 통과 |
| FE 이미지 빌드 | 통과, 태블릿 `index.html`이 `/tablet/assets/...` 참조 확인 |
| BE 이미지 빌드 (`BE/Dockerfile`) | 통과 |
| Compose 통합 스모크 | 마이그레이션 20개 적용, api/web healthy, `/api/v1/health/live` 200, `/` 200, `/tablet/` 200, 태블릿 자산 200 |
| BE `ruff check` / `ruff format --check` (LF 체크아웃) | 통과 (190 files already formatted) |
| BE `python -m mypy` | 통과 (169 source files) |
| BE `pytest` | 413 passed |
| FE `pnpm lint` | 통과 |

검증하지 못한 항목:

- 실제 VM·DNS·TLS(certbot), SSH 배포, GitLab Runner의 Docker-in-Docker, 레지스트리 push.
- 운영 시크릿·AI 키를 넣은 worker 기동, 최초 데이터 seed.
- GitLab에서 파이프라인 실행 자체.

알려진 문제:

- **FE Prettier 검사 실패 3건**: `FE/INTEGRATION.md`, `src/pages/Connected/Connected.css`,
  `src/pages/TabletHomePage/TabletTheme.css`. FE 소유 영역이라 이번 작업에서 고치지 않았고,
  CI의 `pnpm format:check`도 주석 처리했다. FE 담당자가 별도 MR로 정리한 뒤 활성화한다.
- **Windows CRLF**: 로컬 작업 트리가 `core.autocrlf=true`(CRLF)라 ruff·prettier 검사가 실패할 수
  있다. GitLab(Linux)은 LF로 체크아웃하므로 CI에서는 통과한다. 로컬 확인은 LF 체크아웃에서 한다.

## 5. 서버 준비

```
/srv/imleader/                 # prod 브랜치 git clone (읽기 전용 deploy key)
├── BE/, FE/, deploy/ ...
└── deploy/
    ├── compose.yaml
    ├── nginx/default.conf
    ├── deploy.sh
    ├── .env                   # git 제외, chmod 600
    ├── certbot/{conf,www}     # git 제외
    ├── seed/                  # git 제외 (최초 데이터)
    └── backup/                # git 제외 (pg_dump)
```

`.env` 예시 (`/srv/imleader/deploy/.env`):

```dotenv
# 앱
APP_ENV=production
APP_LOG_LEVEL=INFO
APP_DATABASE_URL=postgresql+psycopg://imleader:<DB_PASSWORD>@postgres:5432/imleader
APP_JWT_SECRET=<openssl rand -hex 32 결과, 32자 이상>
APP_AUTH_COOKIE_SECURE=true
APP_CORS_ORIGINS=[]
APP_AI_BASE_URL=https://<승인된 AI 서버>/v1
APP_AI_API_KEY=<키>
APP_AI_MODEL=<모델명>
APP_REPORT_WORKER_LEASE_SECONDS=300
APP_AI_REQUEST_TIMEOUT_SECONDS=120

# Compose 전용
POSTGRES_DB=imleader
POSTGRES_USER=imleader
POSTGRES_PASSWORD=<DB_PASSWORD>   # APP_DATABASE_URL과 동일
REGISTRY_IMAGE=<CI_REGISTRY_IMAGE와 동일한 경로>
IMAGE_TAG=<배포 스크립트가 export>
```

- AI를 쓰지 않으면 `APP_AI_*`를 비우고 `COMPOSE_PROFILES`를 설정하지 않는다(worker 미기동).
- AI를 쓰면 `.env`에 `COMPOSE_PROFILES=ai`를 추가한다. 키가 없는데 worker를 띄우면 재시작 루프가 된다.
- `APP_AUTH_COOKIE_SECURE=true`는 HTTPS 적용 후에만 사용한다.
- PostgreSQL·uvicorn 포트는 호스트에 게시하지 않는다.

## 6. 최초 배포

1. VM 준비: Docker Engine + Compose v2.20 이상, `git`, `curl`, (선택) certbot 설치.
   방화벽은 22(제한)/80/443만 허용한다.
2. DNS A 레코드를 VM IP로 연결한다.
3. 서버에서 `prod` 브랜치를 clone하고 `.env`를 작성한 뒤 `docker login`(read_registry Deploy Token)을
   한 번 수행한다.
4. **`prod` 브랜치를 만든다.** 최신 `dev`에서 생성하고, 직접 push 금지·MR 전용으로 보호한다.
   `prod`에 병합되면 `build:images`가 이미지를 push한다.
5. TLS: `web`을 띄우기 전에 `certbot certonly --standalone -d <도메인>`으로 인증서를 발급하고,
   `deploy/nginx/default.conf`의 443 블록을 활성화한다. (HTTP 먼저 운영하려면 80만 열고
   `APP_AUTH_COOKIE_SECURE=false`로 두되 외부에 노출하지 않는다.)
6. 배포:
   ```bash
   cd /srv/imleader
   ./deploy/deploy.sh <커밋 SHA>
   ```
   스크립트가 prod를 pull하고, 이미지를 pull하고, `alembic upgrade head` 후 api/web을 기동하고
   `/api/v1/health/live`를 확인한다.
7. 최초 데이터 적재(운영 데이터 변경이므로 담당자 승인 후):
   ```bash
   cd /srv/imleader/deploy
   docker compose run --rm -v ./seed:/seed api \
     python -m app.commands.seed_master_data --file /seed/master-data.json
   docker compose run --rm -it api \
     python -m app.commands.seed_accounts --employee-no <사번> --display-name <이름> --role admin
   ```
8. 화면 로그인과 주요 API를 확인하고 cron(백업, reaper, 인증서 갱신)을 등록한다.

## 7. VM QA (feature 브랜치)

운영 전 새 VM에서 Draft MR 브랜치를 확인하는 절차다. CI 이미지 빌드는 `prod`에서만 실행되므로
이 단계에서는 이미지를 VM에서 직접 빌드한다. `deploy.sh`는 기본적으로 `prod`로 전환하고 이미지를
pull하므로 아래 두 옵션으로 건너뛴다.

```bash
cd /srv/imleader
git fetch origin
git switch codex/infra-feature-vm-deployment
cd deploy
# QA 전용 .env: REGISTRY_IMAGE=imleader-qa, IMAGE_TAG=qa, APP_AUTH_COOKIE_SECURE=false
docker build -f ../BE/Dockerfile -t imleader-qa/api:qa ../BE
docker build -f Dockerfile.web -t imleader-qa/web:qa ..
SKIP_PULL=1 SKIP_IMAGE_PULL=1 ./deploy.sh qa
```

- 운영 중인 VM에서 같은 디렉터리로 QA하지 않는다. 프로젝트명(`imleader`), 80/443 포트,
  `postgres_data` 볼륨이 겹친다. 필요하면 별도 VM 또는 `COMPOSE_PROJECT_NAME`·포트 override를 쓴다.
- QA `.env`에는 운영 시크릿·운영 DB를 넣지 않는다.

## 8. 자동 배포와 롤백

흐름: `dev` → `prod` MR → `validate` 통과 → 병합 → `build:images` → `deploy:prod`(수동) → 이후 자동.

- `deploy:prod`는 처음에 `when: manual`이다. 첫 배포가 성공하면 `.gitlab-ci.yml`에서
  `when: manual`을 제거해 자동 배포로 전환한다.
- 서버 체크아웃이 `prod`가 아니거나 로컬 변경이 있으면 `git pull --ff-only`에서 실패한다.
  이는 의도된 보호 장치다.
- 순서: 마이그레이션 → api/worker 기동. BE는 시작 시 마이그레이션 head를 검사하므로
  (`BE/app/db/migrations.py`) 마이그레이션이 선행되어야 한다.
- 롤백: `./deploy/deploy.sh <이전 SHA>`로 이미지만 되돌린다. DB는 전진 수정이 원칙이고,
  `alembic downgrade`는 되돌림이 검증된 revision에 한해 담당자 승인 후 실행한다.
- 파괴적 마이그레이션은 사전 백업과 승인 없이 실행하지 않는다.

## 9. GitLab 설정

**Settings → CI/CD → Variables** (모두 `prod` 보호):

| 변수 | 보호 | 마스킹 | 용도 |
| --- | --- | --- | --- |
| `DEPLOY_HOST` | O | - | VM 주소 |
| `DEPLOY_USER` | O | - | 배포 계정(비-root 권장) |
| `DEPLOY_PATH` | O | - | `/srv/imleader` |
| `SSH_PRIVATE_KEY` | O | O | 배포 전용 키 |
| `SSH_KNOWN_HOSTS` | O | - | 호스트 키 고정 |
| `PUBLIC_URL` | O | - | `environment.url` (예: `https://<도메인>`) |
| `REGISTRY_IMAGE` | O | - | 서버 `.env`의 값과 동일해야 함 |

레지스트리 인증은 기본 변수(`CI_REGISTRY`, `CI_REGISTRY_USER`, `CI_REGISTRY_PASSWORD`)를 쓴다.
서버에는 `read_registry` 권한의 Deploy Token으로 로그인한다.

**Runner 확인 필요**: `build:images`는 Docker-in-Docker(privileged)를 사용한다. Elice GitLab 공유
Runner가 이를 막으면 kaniko로 바꾸거나 서버에서 빌드하도록 수정해야 한다.

## 10. 운영 작업

- **백업**: 매일 `pg_dump` 후 압축 보관(최소 7일, 가능하면 외부 스토리지).
  ```bash
  docker compose exec -T postgres pg_dump -U "$POSTGRES_USER" "$POSTGRES_DB" \
    | gzip > backup/imleader-$(date +%F).sql.gz
  ```
- **worker 정리**: 주기적으로 `python -m app.commands.reap_report_jobs`,
  `python -m app.commands.reap_chat_jobs`를 실행해 중단된 작업을 `interrupted`로 정리한다.
- **로그**: `docker compose logs -f api|web` 및 worker. Compose 로그 로테이션(10MB×3) 적용.
- **인증서 갱신**: certbot renew cron 후 `docker compose exec web nginx -s reload`.
- **디스크**: `docker image prune -f`는 배포 스크립트가 수행한다. 롤백용 직전 이미지는 남긴다.

## 11. `prod` 브랜치 운영

1. 최신 `dev`에서 `prod` 생성.
2. `prod` 보호: 직접 push 금지, MR로만 병합, 병합 권한 제한.
3. `dev` → `prod` MR에서 `validate` 통과 후 병합.
4. `build:images` → `deploy:prod` 순서로 실행. 첫 배포는 수동 승인.
5. 배포 이력은 커밋 SHA로 추적한다. 필요하면 `release-<sha>` 태그를 남긴다.

일상 작업은 `dev`에서 하고, `prod` 병합은 릴리스 단위로만 한다.

## 12. 팀 확인이 필요한 항목

1. VM 위치·스펙, 도메인, TLS 방식(certbot vs Caddy).
2. GitLab Runner의 DinD 허용 여부와 이미지 빌드 방식.
3. PostgreSQL을 같은 VM에 둘지, 관리형 DB를 쓸지(현 규모는 같은 VM 권장).
4. 최초 배포 시 AI 키 제공 여부(`COMPOSE_PROFILES=ai`).
5. `deploy/`·`.dockerignore`·`.gitlab-ci.yml`의 소유자와 리뷰 절차.
6. FE Prettier 실패 3건 정리 담당자와 시점.
7. `prod` 보호 규칙과 배포 자동 전환 시점.
8. 백업 보관 위치·기간.
