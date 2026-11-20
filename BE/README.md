# imleader Backend

Python 3.14, FastAPI, SQLAlchemy, Alembic, PostgreSQL 18 기반의 백엔드 초기 구성이다.
현재 실행 환경과 마이그레이션 안전장치, 계정·조직·설비·품목 및 CSV 공정 재생의 핵심
테이블을 포함한다. 업무 API와 나머지 도메인 테이블은 후속 구현한다. 현재 구조는
`docs/ERD.md`에서 확인한다.

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
실제 `.env`와 비밀값은 커밋하지 않는다.

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
- 모든 응답에는 `X-Request-ID`가 포함된다. 오류 조사 시 같은 ID로 구조화 서버 로그를 찾는다.

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
