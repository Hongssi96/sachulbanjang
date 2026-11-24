# imleader Backend

Python 3.14, FastAPI, SQLAlchemy, Alembic, PostgreSQL 18 기반의 백엔드 초기 구성이다.
현재 실행 환경과 마이그레이션 안전장치, 계정·조직·설비·품목, 로그인 세션 및 CSV 공정 재생의 핵심
테이블을 포함한다. 사번 로그인과 현재 사용자 조회 API를 제공하며 나머지 업무 API는 후속 구현한다.
현재 구조는 `docs/ERD.md`에서 확인한다.

## 1. 로컬 환경 준비

Python 3.14와 Docker가 필요하다. Windows PowerShell 기준:

```powershell
cd BE
python -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install --upgrade pip
python -m pip install -r requirements-dev.txt
Copy-Item .env.example .env
```

`.env`의 `APP_DATABASE_URL`, `APP_JWT_SECRET`을 개인 개발 값으로 변경한다. JWT 비밀값은
32자 이상이어야 한다. AI 연동 시 승인된 OpenAI 호환 서버의 `/v1` 포함 주소를
`APP_AI_BASE_URL`, 발급 키를 `APP_AI_API_KEY`, 모델 ID를 `APP_AI_MODEL`에 설정한다. 예시 모델은
`gpt-6.2-sol`이다. `APP_AI_API_KEY`가 비어 있어도 일반 기능은 실행된다. 실제 키와 `.env`는
커밋하지 않는다.
`APP_ACCESS_TOKEN_TTL_SECONDS`, `APP_REFRESH_TOKEN_TTL_SECONDS`, `APP_LOGIN_MAX_FAILURES`,
`APP_LOGIN_LOCK_SECONDS`, `APP_REFRESH_REUSE_GRACE_SECONDS`, `APP_TEMPORARY_PASSWORD_TTL_SECONDS`로
인증 기본값을 조정한다. 실제 HTTPS
배포에서는 `APP_AUTH_COOKIE_SECURE=true`로 설정한다. FE 개발 서버 출처는 `APP_CORS_ORIGINS`에 JSON
배열로 나열하며 비어 있으면 CORS 미들웨어를 추가하지 않는다.

## 2. PostgreSQL과 마이그레이션

```powershell
docker compose up -d postgres
alembic current
alembic upgrade head
alembic current
```

마이그레이션은 서버 시작과 분리해 명시적으로 적용한다. 서버는 시작할 때 DB의 현재 revision과
코드의 head를 비교하며, 다르면 자동 변경하지 않고 시작을 중단한다. 이때 위의
`alembic upgrade head`를 실행한 뒤 서버를 다시 시작한다. 공유·적용된 migration은 수정하지
말고 후속 revision을 추가한다.

## 3. 실행

```powershell
uvicorn app.main:app --reload
```

- OpenAPI: `http://localhost:8000/docs`
- liveness: `GET http://localhost:8000/api/v1/health/live`
- 로그인: `POST http://localhost:8000/api/v1/auth/login` (`employee_no`, `password`)
- 현재 사용자: `GET http://localhost:8000/api/v1/auth/me` (로그인 응답의 액세스 쿠키 필요)
- 토큰 갱신: `POST http://localhost:8000/api/v1/auth/refresh` (리프레시 쿠키 + `X-CSRF-Token` 헤더)
- 로그아웃: `POST http://localhost:8000/api/v1/auth/logout` (인증 쿠키 + `X-CSRF-Token` 헤더)
- 비밀번호 변경: `PATCH http://localhost:8000/api/v1/auth/password` (`current_password`,
  `new_password`, 액세스 쿠키 + `X-CSRF-Token` 헤더)
- 관리자 비밀번호 초기화: `POST http://localhost:8000/api/v1/users/{user_id}/password-reset`
  (관리자, 액세스 쿠키 + `X-CSRF-Token` 헤더, 응답의 `temporary_password`는 1회만 표시)
- 사용자 목록·상세: `GET http://localhost:8000/api/v1/users`, `GET .../users/{user_id}` (관리자)
- 사용자 수정: `PATCH http://localhost:8000/api/v1/users/{user_id}` (`version` 필수 + 변경 필드,
  관리자, `X-CSRF-Token` 헤더)
- 계정 비활성화·재활성화: `POST .../users/{user_id}/deactivation`, `POST .../users/{user_id}/reactivation`
  (`version`, 관리자, `X-CSRF-Token` 헤더. 비활성화 시 기존 세션·리프레시 폐기)
- 계정 감사 이력: `GET .../users/{user_id}/audit-events` (관리자)
- 임시 비밀번호로 로그인한 계정은 비밀번호 변경 전까지 업무 API가 `403 PASSWORD_CHANGE_REQUIRED`로
  차단되고, 만료된 임시 비밀번호 로그인은 `401 TEMPORARY_PASSWORD_EXPIRED`로 거부된다
- 근무 종료 조회: `GET http://localhost:8000/api/v1/work-session`
- 근무 종료 연장: `POST http://localhost:8000/api/v1/work-session/extensions`
  (`automatic` 또는 `manual`, 액세스 쿠키 + `X-CSRF-Token` 헤더)
- 생산 이력: `GET http://localhost:8000/api/v1/process-records`,
  `GET .../process-records/{id}` (`equipment_id`, `product_id`, `from`, `to`, `page`, `page_size`)
- 검사 이력: `GET http://localhost:8000/api/v1/inspection-records`,
  `GET .../inspection-records/{id}` (위 필터 + `verdict=good|defect`)
- 이력 조회는 관리자·고용자 모두 가능하며, `from`은 포함·`to`는 제외하는 한국 기준 날짜다
- 기록 정정: `PATCH http://localhost:8000/api/v1/process-records/{id}`,
  `PATCH .../inspection-records/{id}` (`version`, `change_reason` 필수 + 수정 필드, 관리자,
  `X-CSRF-Token` 헤더. 원천 식별자·`is_demo` 변경 불가)
- 변경 이력: `GET .../process-records/{id}/changes`, `GET .../inspection-records/{id}/changes` (관리자)
- 마스터 목록: `GET http://localhost:8000/api/v1/departments`, `GET .../production-lines`
  (`department_id`), `GET .../equipment` (`production_line_id`), `GET .../products` (`q`).
  활성 데이터 전체를 반환한다
- 본인 담당: `GET http://localhost:8000/api/v1/assignments/me`
  (`departments`·`production_lines`·`equipment`로 묶어 id·코드·이름 반환)
- 보고서 목록·상세: `GET http://localhost:8000/api/v1/reports` (`q`, `category`, `business_status`,
  `from`, `to`, `page`, `page_size`), `GET .../reports/{id}`
- 보고서 등록(AI 생성 전 임시): `POST .../reports` (`title`, `body_markdown`, `category`,
  `report_kind`, `X-CSRF-Token` 헤더)
- 보고서 수정·상태 변경·삭제: `PATCH .../reports/{id}` (`version`, `title?`, `body_markdown?`),
  `PATCH .../reports/{id}/status` (`version`, `business_status`, 관리자),
  `DELETE .../reports/{id}?expected_version=` (soft delete)
- 보고서 이력: `GET .../reports/{id}/revisions`, `GET .../reports/{id}/revisions/{version}`,
  `GET .../reports/{id}/status-events`
- 보고서 PDF: `GET .../reports/{id}/pdf` (현재 버전 Markdown·저장 집계·불량 유형 그래프를
  Pretendard 한글 글꼴로 즉시 생성하며 다운로드 버전·사용자를 기록)
- 품질 통계: `GET http://localhost:8000/api/v1/quality/summary`
  (`from`, `to`, `equipment_id`, `product_id`. 검사·양품·불량 건수, 불량률(null 허용),
  유형 분포(type null=미분류), 생산 기록 건수, 시연 포함 여부)
- 인수인계 목록: `GET http://localhost:8000/api/v1/handover-notes`
  (`q`, `department_id`/`production_line_id`/`equipment_id`, `include_all`, `page`, `page_size`.
  고용자 기본은 본인 담당 필터)
- 인수인계 상세·작성: `GET .../handover-notes/{id}`, `POST .../handover-notes`
  (`body`, `targets`? — 생략 시 작성자 담당, `X-CSRF-Token` 헤더)
- 인수인계 수정·삭제: `PATCH .../handover-notes/{id}` (`version`, `body`?/`targets`? — 작성자 본인만),
  `DELETE .../handover-notes/{id}?expected_version=` (관리자 전체·고용자 본인, soft delete)
- 인수인계 확인: `PUT .../handover-notes/{id}/confirmation` (본인 확인, 반복 시 기존 기록 반환)
- 재고 잔고: `GET http://localhost:8000/api/v1/stocks` (`q`, `low_stock`, `page`, `page_size`)
- 재고 원장: `GET http://localhost:8000/api/v1/stock-movements`
  (`product_id`, `kind`, `from`, `to`, `page`, `page_size`)
- 재고 등록: `POST .../stock-movements` (`product_id`, `kind`(initial/receipt/issue/adjustment),
  `quantity`, `reason`?, `X-CSRF-Token` 헤더. 초기 재고는 관리자만)
- 재고 정정·확인: `POST .../stock-movements/{id}/corrections` (`delta`, `reason`),
  `POST .../stock-movements/{id}/confirmation` (관리자)
- 최소 재고: `PATCH .../products/{id}/minimum-stock` (`minimum_stock` nullable, 관리자)
- 일정 목록: `GET http://localhost:8000/api/v1/schedules`
  (`from`, `to`(한국 기준, 양 끝 포함), `page`, `page_size`. 범위와 겹치는 일정을 시작 순 반환)
- 일정 상세: `GET .../schedules/{id}`
- 일정 등록: `POST .../schedules` (`title`, `category`, `all_day`, 종일이면 `start_date`·`end_date_exclusive`,
  시간 지정이면 `starts_at`·`ends_at`, `X-CSRF-Token` 헤더)
- 일정 수정·삭제: `PATCH .../schedules/{id}` (`version` + 변경 필드, 날짜·시각 혼용 금지),
  `DELETE .../schedules/{id}?expected_version=` (soft delete. 관리자 전체·고용자 본인)
- 보고서 생성 작업 접수: `POST .../report-jobs` (`client_request_key`, `report_kind`, `category`,
  `period`, `targets`, `force_regenerate`, `X-CSRF-Token` 헤더). 같은 키·같은 내용은 기존 작업을
  반환하며, 같은 조건의 완료 보고서가 있으면 `report_id`를 반환한다. 명시적 재생성은
  새 요청 키와 `force_regenerate=true`를 사용한다
- 생성 작업 조회·취소·재시도: `GET .../jobs`, `GET .../jobs/{id}`, `POST .../jobs/{id}/cancel`,
  `POST .../jobs/{id}/retry` (요청자 본인, CSRF 필요 시 헤더 포함)
- 모든 응답에는 `X-Request-ID`가 포함된다. 오류 조사 시 같은 ID로 구조화 서버 로그를 찾는다.

### 초기 계정 준비

마이그레이션 적용 후 관리자·고용자 계정을 만든다. 비밀번호는 `--password`를 생략하면 화면에
남지 않게 입력받는다. 같은 사번이 이미 있으면 덮어쓰지 않고 실패한다.

```powershell
python -m app.commands.seed_accounts `
  --employee-no A9001 --display-name "관리자" --role admin `
  --shift-start 08:30 --shift-end 17:30
```

기본값은 근무 시작 `09:00`, 종료 `18:00`이고 최초 로그인 시 비밀번호 변경이 필요하다
(`--no-must-change-password`로 해제).

### 조직·담당 초기 데이터 적재

부서·라인·설비 연결과 사용자 담당을 JSON 파일로 적재한다. 설비는 CSV 적재 등으로 이미 존재해야 한다.

```json
{
  "departments": [{"code": "D1", "name": "생산1부"}],
  "production_lines": [
    {"department_code": "D1", "code": "L1", "name": "1라인", "equipment_codes": ["S01", "S02"]}
  ],
  "assignments": [
    {
      "employee_no": "W9001",
      "department_codes": ["D1"],
      "production_lines": [{"department_code": "D1", "code": "L1"}],
      "equipment_codes": ["S01"]
    }
  ]
}
```

```powershell
python -m app.commands.seed_master_data --file master.json
```

재실행해도 중복 생성하지 않고 기존 값을 임의로 덮어쓰지 않는다. 없는 사용자·설비나 다른 라인에 이미
속한 설비가 있으면 전체를 롤백하고 실패한다.

### 보고서 생성 작업 큐 정리

worker 임차가 만료된 `querying`·`writing` 생성 작업을 `interrupted`로 정리한다. 실제 AI 실행 worker는
별도 작업이다. 서버 복구 후 자동 재실행은 하지 않으며 요청자가 재시도한다.

```powershell
python -m app.commands.reap_report_jobs
```

### AI 보고서 생성 worker

`APP_AI_BASE_URL`, `APP_AI_API_KEY`, `APP_AI_MODEL`을 설정한 뒤 API 서버와 별도 프로세스로
worker를 실행한다. worker는 접수된 작업의 기간·부서·라인·설비 조건으로 서버 집계를 만들고,
개별 사용자 정보나 원본 레코드 대신 집계 스냅샷만 OpenAI 호환 `/chat/completions` API에 전달한다.
생성 성공 시 Markdown 보고서와 집계 기준 시각·대상·수치를 한 트랜잭션으로 저장한다.

```powershell
python -m app.commands.run_report_worker
```

대기 작업을 최대 한 건만 처리해 연결을 점검하려면 `--once`를 사용한다. 외부 요청 제한 시간은
`APP_AI_REQUEST_TIMEOUT_SECONDS`, worker 임차 시간은 `APP_REPORT_WORKER_LEASE_SECONDS`로 조정한다.
임차 시간은 외부 요청 제한 시간보다 길게 설정한다. AI 설정이 없으면 일반 API는 계속 실행되지만
worker는 시작하지 않는다.

### 공정 CSV 적재

마이그레이션 적용 후 공정 CSV를 적재한다. 원본 `TimeStamp`는 한국시간(`Asia/Seoul`)으로
해석하며 다른 원천만 `--source-timezone`으로 덮어쓴다.

```powershell
python -m app.commands.import_process_csv `
  "C:\path\to\molding.csv"
```

DB에 연결하거나 저장하지 않고 전체 행만 검증하려면 `--validate-only`를 추가한다.

적재는 파일 전체를 하나의 트랜잭션으로 처리한다. 필수 헤더·수치·마스터 데이터 충돌이 있으면
전체를 롤백한다. 같은 파일 fingerprint는 재적재하지 않고, 같은 `_id`가 다른 내용으로 들어오면
충돌로 중단한다. 원본 파일은 저장소에 커밋하지 않는다.

### 공정 CSV 재생

적재 결과로 생성된 replay ID를 지정하면 첫 레코드를 즉시 공개하고 이후 레코드를 5초 간격으로
공개한다. 마지막 레코드를 공개하면 상태를 `completed`로 바꾸고 마지막 공정 값을 유지한다.

```powershell
python -m app.commands.run_process_replay 1
```

한 번만 진행 가능 여부를 확인하려면 `--once`를 사용한다. 여러 worker가 같은 replay를 실행해도
행 잠금으로 한 worker만 재생 위치를 변경한다. 조회 시 마지막 정상 갱신부터 15초가 지나면
`delayed`로 판정하되, 정상 종료된 `completed` 상태는 지연으로 바꾸지 않는다.

## 4. 검증

```powershell
ruff check .
ruff format --check .
mypy
pytest
```

DB 통합 테스트는 개발 DB와 다른 전용 PostgreSQL에서만 실행한다. 테스트 DB URL이 없거나 개발
DB와 같으면 데이터를 초기화하는 통합 테스트를 실행하지 않는 보호 장치를 업무 스키마 구현과
함께 추가한다. 기본 자동 테스트는 실제 AI API를 호출하지 않는다.

## 5. Docker 이미지 확인

```powershell
docker build -t imleader-be .
```

컨테이너 실행에도 필수 환경변수와 적용된 DB migration이 필요하다. 운영 배포·백업·쿠키 출처
설정은 관련 결정이 확정된 뒤 추가한다.
