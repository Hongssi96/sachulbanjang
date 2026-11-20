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
32자 이상이어야 한다. `APP_AI_API_KEY`는 선택값이며 비어 있어도 일반 기능은 실행된다.
`APP_ACCESS_TOKEN_TTL_SECONDS`, `APP_REFRESH_TOKEN_TTL_SECONDS`, `APP_LOGIN_MAX_FAILURES`,
`APP_LOGIN_LOCK_SECONDS`로 인증 기본값을 조정한다. 실제 HTTPS 배포에서는
`APP_AUTH_COOKIE_SECURE=true`로 설정한다. FE 개발 서버 출처는 `APP_CORS_ORIGINS`에 JSON 배열로
나열하며 비어 있으면 CORS 미들웨어를 추가하지 않는다. 실제 `.env`와 비밀값은 커밋하지 않는다.

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
