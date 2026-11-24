# 로컬 백엔드 연결

데스크톱(5174)과 태블릿(5175)은 각자 화면을 실행하고 동일한 FastAPI(8000)와 PostgreSQL을 사용합니다.
프런트엔드는 `/api`를 Vite 프록시로 전달합니다. `VITE_API_BASE_URL`을 설정하면 해당 주소가 우선합니다.
실제 배포 서버에도 `/api` 리버스 프록시 또는 적절한 CORS·쿠키 구성이 필요합니다.

## 실행 (Git Bash)

백엔드 최초 설정은 `../BE/README.md`의 가상환경·환경변수·마이그레이션·계정 발급 절차를 따릅니다.
`.env`와 비밀번호는 저장소에 커밋하지 않습니다. API 키 없이 일반 업무 기능을 실행할 수 있습니다.

```bash
cd BE
docker compose up -d postgres
source .venv/Scripts/activate
python -m alembic upgrade head
python -m uvicorn app.main:app --host 127.0.0.1 --port 8000
```

별도 터미널에서 각 사이트를 실행합니다.

```bash
cd FE
pnpm exec vite --host 127.0.0.1 --port 5174 --strictPort --configLoader runner
```

```bash
cd FE
pnpm dev:tablet
```

로그인은 서버에서 발급한 사번 계정을 사용합니다. 최초 로그인에 비밀번호 변경이 필요하면 업무 화면을 차단하고 변경 창을 표시합니다.
관리자는 프로필의 **사번 계정 발급**에서 근무자 계정을 생성할 수 있습니다. 임시 비밀번호는 응답 창에서 한 번 표시합니다.
공개 회원가입은 백엔드 정책상 제공되지 않습니다.

## 연결 범위

| 화면                  | 실제 API와 동작                                                                                     |
| --------------------- | --------------------------------------------------------------------------------------------------- |
| 로그인·프로필         | `/auth/login`, `/auth/me`, `/auth/refresh`, `/auth/logout`, `/auth/password`                        |
| 근무 시간             | `/work-session`, `/work-session/extensions`; 서버 시간 기준 남은 시간과 연장                        |
| 홈                    | 품질 요약·설비 수·최근 보고·인수인계 조회                                                           |
| 인수인계              | `/handover-notes`; 태블릿 전용 화면에서 목록·상세·작성·본인 수정·확인·권한에 따른 삭제              |
| 실시간 공정·설비      | `/equipment`, `/process/current`; 30초 갱신                                                         |
| 생산·검사 이력        | `/process-records`, `/inspection-records`; 필터·페이지·상세·관리자 정정                             |
| 재고                  | `/stocks`, `/stock-movements`, `/products/{id}/minimum-stock`; 목록·원장·입출고·조정·안전 재고 변경 |
| 품질                  | `/quality/summary`; 실제 검사 건수·불량률·유형 분포                                                 |
| 올라온 보고·이상 보고 | `/reports`; 수동 작성·목록·상세·수정·삭제·관리자 처리 상태 변경                                     |
| 일정·태블릿 작업 지시 | `/schedules`; 일정 목록·상세·등록·수정·삭제                                                         |
| 계정 발급             | `/users`; 관리자 목록·사번 계정 생성                                                                |
| 현장 파트너 대화      | `/conversations`; 계정별 대화 목록·검색·상세·삭제, 질문 접수·상태 확인·실패 재시도·최신 자료 갱신, 답변 근거 표시 |

기존 예시 화면 파일은 참고용으로 남겨두었으며 실행 경로는 `src/pages/Connected/LiveRoutes.tsx`입니다.
데스크톱은 기존 사이드바, 태블릿은 별도 메뉴를 사용합니다. 업무 본문은 API가 제공하는 항목을 기준으로 재구성했습니다.

## 제공되지 않는 기능

- 현장 파트너 채팅은 데스크톱·태블릿에서 최신 BE 대화 API를 사용합니다.
- 실제 AI 답변에는 대화 API가 포함된 최신 BE 코드, DB 마이그레이션, 별도 `python -m app.commands.run_chat_worker` 실행이 필요합니다. 서버 환경에 `APP_AI_BASE_URL`, `APP_AI_API_KEY`, `APP_AI_MODEL`이 설정되어야 합니다. Worker가 실행되지 않으면 질문은 접수되지만 계속 대기 상태로 표시됩니다.
- 자동 보고서 생성은 연결하지 않았습니다.
- 작업 지시의 시작·완료 저장 API는 없어 **일정**으로 연결했습니다. 작업 완료를 저장한 것처럼 표시하지 않습니다.
- 실시간 온도·압력·가동 상태·목표 생산량 API가 없으므로 임의 수치를 표시하지 않습니다.
- 정밀 검사는 저장된 검사 기록 확인으로 연결되며 사진 분석이나 새 측정값 생성은 하지 않습니다.
- 캐릭터 선택은 사용자 ID별 브라우저 저장이며 서버 프로필 이미지로 업로드하지 않습니다.
- 예약·가용 재고, 주간 추이 등 API에서 제공하지 않는 계산은 임의로 만들지 않습니다.

## 검증

```bash
cd FE
pnpm lint
pnpm exec tsc -b
pnpm build:tablet
pnpm build
```

`tests/api_smoke.py`는 **폐기 가능한 로컬 개발 DB 전용** 통합 확인 스크립트입니다.
두 사이트의 프록시를 통과해 조회, 보고 생성·상태·버전 충돌·삭제, 일정 등록·삭제,
인수인계 작성·확인·삭제, 재고 입출고, CSRF 거부와 로그아웃을 확인합니다.
테스트용 보고·일정·노트는 soft delete하며 원장의 테스트 입출고는 수량 합계가 0이 되도록 남습니다.
관리자 테스트 계정을 환경변수로 전달하고 백엔드 가상환경의 Python으로 실행합니다.

```bash
IMLEADER_TEST_USER='테스트사번' IMLEADER_TEST_PASSWORD='테스트비밀번호' \
  ../BE/.venv/Scripts/python.exe tests/api_smoke.py
```
