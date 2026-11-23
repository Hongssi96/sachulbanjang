# API 계약 초안

2026-11-19 FE·BE 공동 검토에서 합의한 공통 기준을 기록한다(DEC-152).
개별 경로·요청·응답 필드는 검토 초안이며 실제 구현과 일치 여부는 구현 후 검증한다.
팀원의 작성·확인·검증 절차는 [API_DOCUMENTATION_GUIDE.md](API_DOCUMENTATION_GUIDE.md)를 따른다.

## 합의한 공통 기준

| 항목 | 기준 |
| --- | --- |
| 기본 경로 | /api/v1 |
| JSON 필드 | snake_case |
| 시각 | UTC·RFC 3339 전송, 화면은 한국 시간 표시 |
| 인증 | 액세스·리프레시 쿠키, HttpOnly, HTTPS 환경 Secure, 서버 CSRF 방어 |
| 단건 성공 | 데이터 객체 |
| 목록 성공 | items와 페이지 정보 |
| 생성 접수 | 작업 ID와 처리 상태 |
| 오류 | HTTP 상태 코드와 code·message·request_id |
| 입력 오류 | 필드별 오류 정보를 선택적으로 추가 |
| 페이지 조회 | 페이지 번호·페이지 크기, offset 방식 |
| 페이지 크기 | 기본 10개, 최대 100개, 사용자가 선택 |
| 하단 번호 | 1~10, 11~20처럼 10개씩 묶어 이동 |

검색·필터와 페이지 조회에는 서버의 현재 권한과 삭제 정책을 적용한다.
서버는 안정적인 정렬을 적용하고, 통계는 상세 페이지 크기와 관계없이 요청 범위 전체를 집계한다.
구체적인 검색 필드·정렬 순서와 페이지 메타데이터 필드명은 개별 명세에서 검토한다.
서버는 검색·필터 결과 전체에 정렬을 적용한 뒤 페이지를 나눈다. 정렬 변경 시 첫 페이지로 이동하며 이후 페이지에도 같은 조건을 유지한다. 허용 정렬 필드·방향은 API별로 명세한다(DEC-156).

## 권한과 삭제

FE가 사용 중인 계약의 호환성이 깨지는 변경은 새 규격 추가 → FE 전환 확인 → 기존 규격 제거 순서로 적용한다. 작은 내부 변경은 FE·BE가 같은 적용 시점을 합의한다(DEC-154).

- 보고서는 관리자 전체·고용자 본인 조회다. 수정·삭제는 고용자에게 완료 전 본인 보고만 허용한다.
- 공정·생산/검사·품질·완제품 재고는 양 역할 모두 전체 조회한다.
- 대화는 역할에 관계없이 본인 대화만 조회한다.
- 인수인계는 전체 조회와 본인 담당 기본 필터를 제공한다.
- 일반 목록은 soft delete 데이터를 제외한다. 삭제된 작성자·설비·품목의 과거 업무 이력 보존과 과거 AI 답변 참고 정책은 REQUIREMENTS.md를 따른다.

## 개별 API 설계 작업 목록

아래는 계약 작성 순서의 초안이다. 엔드포인트 경로·HTTP 메서드·필드 확정은 후속 설계에서 진행한다.

| 영역 | 상세 명세에 포함할 동작 |
| --- | --- |
| 인증 | 사번 로그인, 갱신, 로그아웃, 비밀번호 변경·초기화, 로그인 실패 제한 |
| 근무 | 현재 종료 시각, 야근 연장, 종료 전 알림, 재로그인 후 종료 시각 확인 |
| 공정 | CSV 시연 상태와 설비별 조회, 기준·조회 시각, 갱신 지연 |
| 보고서 | 생성 접수·상태·취소·재시도, 목록·상세·수정·soft delete |
| 보고서 이력 | 버전 확인, 동시 수정 검사, 버전별 PDF 다운로드와 이력 |
| 검사·품질 | 필터 목록·상세, 공통 집계, 시연 표시 |
| AI 대화 | 질문 접수·상태·취소·재시도, 이력·검색·삭제·최신 재조회 |
| 일정 | 목록·달력·상세·CRUD |
| 재고 | 수량·거래 이력, 입출고·조정·정정·사후 확인·최소 수량 |
| 인수인계 | 작성·조회·본인 수정·확인·soft delete |

## 구현 상태

기준일은 2026-11-20이다. 상태는 코드 작성 여부만이 아니라 계약·검증 완료 여부를 함께 나타낸다.
각 기능 MR은 병합 전에 관련 행의 상태·검증 근거·갱신일을 함께 수정한다.

| 영역 | 상태 | 검증 근거 | 갱신일 |
| --- | --- | --- | --- |
| 공통 BE 실행 기반 | 검증 완료 | FastAPI 앱·환경설정·요청 ID·Alembic 시작 검사, Python 3.14 이미지와 PostgreSQL 18.7 통합 검증(MR !11·!13) | 2026-11-20 |
| 인증·계정 관리 | 검증 완료 | 로그인·갱신·로그아웃·현재 사용자 조회·본인 비밀번호 변경·관리자 계정 생성·비밀번호 초기화, 관리자 사용자 목록·상세·수정·비활성화·재활성화·감사 이력 조회, Argon2id 검증, 5회 실패 잠금, 임시 비밀번호 24시간(설정값) 만료와 최초 변경 강제, HttpOnly 쿠키, 액세스 15분/리프레시 7일, 리프레시 회전·재사용 감지·동시 갱신 유예, CSRF 더블 서브밋, 최초 관리자 시드 CLI, FE 출처 CORS 구현. Ruff·mypy·pytest 160건 및 PostgreSQL 18 계정 생성·초기화·비활성화 통합 검증 | 2026-11-23 |
| 근무 | 구현 완료 | 로그인별 종료 시각·서버 시각 조회, 수동 1시간/지정 시각 연장, 종료 10분 전 실제 작업에 따른 자동 1시간 연장, 다중 탭 충돌·중복 자동 연장 방지, 연장 이력 구현. pytest 92건 확인 | 2026-11-23 |
| 공정 | 구현 중 | 핵심 스키마·CSV 적재·5초 재생·정상 종료·15초 지연 판정과 인증된 현재 공정 조회 구현. 전체 pytest 및 PostgreSQL 18 replay 검증. FE polling 연동 미확인 | 2026-11-20 |
| 보고서·이력 | 미착수 | - | 2026-11-20 |
| 검사·품질 | 미착수 | - | 2026-11-20 |
| AI 대화 | 미착수 | - | 2026-11-20 |
| 일정 | 미착수 | - | 2026-11-20 |
| 재고 | 미착수 | - | 2026-11-20 |
| 인수인계 | 미착수 | - | 2026-11-20 |

상태 정의:

- `미착수`: 구현 코드와 검증이 시작되지 않았다.
- `구현 중`: 코드·마이그레이션·테스트 중 하나 이상을 작업하고 있다.
- `구현 완료`: 합의한 코드가 작성됐지만 필수 검증 또는 계약 대조가 남아 있다.
- `검증 완료`: 관련 린트·타입 검사·테스트와 API 계약 대조를 통과했다.
- `보류`: 외부 정보나 비즈니스 결정이 필요해 의도적으로 진행을 멈췄다.

### 공정 세부 구현 상태

- [x] 계정·조직·설비·제품·공정 적재·재생 핵심 스키마와 Mermaid ERD
- [x] 실제 CSV 필수 헤더·TimeStamp·Cycle_Time 검증과 `Asia/Seoul` → UTC 변환
- [x] 설비·제품 마스터 연결, 전체 원자적 적재, 초기 `ready` replay 생성
- [x] 파일 fingerprint 재적재 차단과 원천 `_id` 중복·충돌 처리
- [x] DB에 저장하지 않는 전체 CSV `--validate-only` 검증 명령
- [x] 5초 간격 공정 레코드 재생과 정상 종료·15초 지연 판정
- [x] 인증·권한이 적용된 `GET /process/current` 응답과 OpenAPI 계약
- [ ] FE polling 연동과 시연·기준 시각·조회 시각·오류 상태 표시 확인

상위 공정 상태는 위 필수 항목이 일부 남아 있으므로 `구현 중`이다. 체크된 하위 항목만 완료로
간주하며 CSV 적재 구현을 실시간 공정 전체 완료로 표현하지 않는다.

## 개별 API 기술 기본안

아래 경로·필드명은 BE 설계 후보이며 FE가 개별 계약을 승인했거나 구현됐다는 뜻은 아니다. 공통 계약 DEC-152는 유지한다. 경로의 복수형은 HTTP 리소스 명명이며 DB의 단수 테이블 규칙과 구분한다. base는 /api/v1이다.

| 메서드·경로 | 입력·동작 | 권한·핵심 응답 |
| --- | --- | --- |
| POST /auth/login | employee_no, password | 쿠키 설정, 사용자·근무 종료 시각. 토큰 원문 JSON 반환 없음 |
| POST /auth/refresh, POST /auth/logout | 인증 쿠키·CSRF 계약 | 회전·현재 세션 종료 |
| GET /auth/me | 현재 사용자 | 역할·담당·비밀번호 변경 필요 여부 |
| PATCH /auth/password | current_password, new_password | 본인. 임시 비밀번호 변경 제한 처리 |
| POST /users | employee_no, display_name, role, shift_start_local, shift_end_local | 관리자, CSRF. 임시 비밀번호를 응답에서 1회 반환 |
| POST /users/{id}/password-reset | 요청 본문 없음 | 관리자, CSRF. 임시 비밀번호를 응답에서 1회 반환하고 기존 세션·리프레시 폐기 |
| GET /users | q, role, include_inactive, page, page_size | 관리자. items·pagination, `is_active` 포함 |
| GET /users/{id} | 없음 | 관리자. 비활성 계정도 조회하며 `deactivated_at` 포함 |
| PATCH /users/{id} | version, display_name?, role?, shift_start_local?, shift_end_local? | 관리자, CSRF. 본인 역할 변경·마지막 관리자 강등 차단 |
| POST /users/{id}/deactivation | version | 관리자, CSRF. soft delete와 세션·리프레시 폐기 |
| POST /users/{id}/reactivation | version | 관리자, CSRF. 비활성 계정 복원 |
| GET /users/{id}/audit-events | page, page_size | 관리자. 계정 조치 감사 이력 |
| GET /work-session | 현재 종료 시각·서버 시각·세션 버전 | 현재 세션 |
| POST /work-session/extensions | kind, expected_ends_at, ends_at? | 자동: 구간·중복 검사. 수동: 1시간 또는 지정 시각. 새 종료 시각 |
| GET /assignments/me | 본인 기본 대상 | 부서·라인·설비 복수 배정 |
| GET /departments, /production-lines, /equipment, /products | 등록 가능한 활성 대상 | 기존 조회 범위. 마스터 관리 CRUD는 추후 |
| GET /process/current | 설비·품목과 최근 수치·시연·재생 상태 | 관리자·고용자 전체 |
| GET /process-records, /inspection-records | 기간·설비·품목·판정 조건 | 페이지 목록 |
| GET /process-records/{id}, /inspection-records/{id} | 개별 기록 | 일반 조회 권한 |
| PATCH /process-records/{id}, /inspection-records/{id} | version, reason, 허용 수정 필드 | 관리자. 기술 키·원천 식별자를 임의 변경하지 못함 |
| DELETE /process-records/{id}, /inspection-records/{id} | expected_version·사유를 query/header 계약으로 확정 | 관리자 soft delete·감사 이력 |
| GET /process-records/{id}/changes, /inspection-records/{id}/changes | 변경 이력 | 관리자만 |
| GET /quality/summary | 기간·설비·품목 필터 | 판정 건수·불량률·유형. 가동률은 설비·날짜 범위 별도 명시 |
| GET /quality/operation | 한국 기준 날짜·설비 | 계획/실제 시간·가동률·is_demo |
| POST /report-duplicate-checks | report_kind, period, targets | 조회 가능한 동일 조건 보고서만 안내 |
| POST /report-jobs | client_request_key, report_kind, category, period, targets, 중복 확인 결과에 대한 재생성 선택 | 202: job_id, state, accepted_at, data_cutoff_at |
| GET /jobs, GET /jobs/{id} | 본인 작업과 상태·safe_error_message·결과 링크 | 역할과 무관하게 요청자 본인 |
| POST /jobs/{id}/cancel, POST /jobs/{id}/retry | 재시도에는 새 client_request_key | 본인. 재시도는 새 job_id·새 기준 시각 |
| GET /reports, GET /reports/{id} | 검색·분류·상태·기간 | 관리자 전체·고용자 본인 |
| PATCH /reports/{id} | version, title?, body_markdown? | 관리자 전체·고용자 완료 전 본인. 집계 변경 불가 |
| PATCH /reports/{id}/status | version, business_status | 관리자만. 상태 이벤트 기록 |
| DELETE /reports/{id} | expected_version | 기존 역할·상태별 삭제 권한 |
| GET /reports/{id}/revisions, /revisions/{version} | 읽기 전용 과거 제목·본문 | 현재 보고서 조회 권한 |
| GET /reports/{id}/pdf?version=... | 선택 버전 PDF 생성 | 조회 권한. 파일 응답, 다운로드 이벤트 |
| GET /reports/{id}/downloads | 다운로드 사용자·시각·버전, 합계 | 현재 보고서 조회 권한 |
| GET /reports/{id}/charts/{chart_key}?version=... | 저장 집계 기반 이미지 생성·재시도 | 조회 권한. 실패 시 JSON 오류+사유, 화면/PDF 대체 안내 |
| POST /conversations, GET /conversations | 본인 대화 생성·검색 | 제목·질문·권한 있는 답변 검색 |
| GET /conversations/{id}, DELETE /conversations/{id} | 본인 조회·soft delete | 관리자도 타인 대화 불가 |
| POST /conversations/{id}/turns | question, client_request_key | 202: turn_id, job_id, state |
| POST /conversations/{id}/turns/{turn_id}/refresh | 새 요청 키·기존 조건 기반 최신 재조회 | 새 질문·답변 추가. 실패 재시도와 구분 |
| GET /schedules, POST /schedules | 달력 범위/페이지 조회·종일/시간 지정 등록 | 양 역할 |
| GET /schedules/{id}, PATCH /schedules/{id}, DELETE /schedules/{id} | 버전 포함 수정·삭제 | 조회 전체, 수정·삭제 관리자 또는 작성자 |
| GET /handover-notes, POST /handover-notes | 본인 담당 기본 필터·전체 조회·등록 | 양 역할 |
| GET /handover-notes/{id} | 본문·대상·수정 시각·확인 정보 | 양 역할 전체 조회 |
| PATCH /handover-notes/{id}, DELETE /handover-notes/{id} | 본인 수정, 삭제 관리자 전체·고용자 본인 | 관리자 타인 본문 수정 불가 |
| PUT /handover-notes/{id}/confirmation | 본인 확인 기록 | 반복 요청으로 확인자 중복 생성하지 않음 |
| GET /stocks, GET /stock-movements | 수량·원장·확인 여부 | 양 역할 전체 조회 |
| POST /stock-movements | product_id, kind, quantity 또는 signed delta, reason | 양 역할, 음수 차단·즉시 반영. 필드별 종류 계약 구체화 |
| POST /stock-movements/{id}/corrections | delta, reason | 관리자 또는 확인 전 원작성자, 별도 원장 |
| POST /stock-movements/{id}/confirmation | 관리자 사후 확인 | 관리자만 |
| PATCH /products/{id}/minimum-stock | minimum_stock nullable | 관리자만 |

마스터 편집·검사 수동 등록·재고 원장 삭제·예약 보고·복구 API는 추가하지 않는다. 사용자 목록·수정·비활성화는 후속 계정 관리 범위다. 실제 검사 수집 API는 원천·인증 규격 확보 후 별도 설계한다.

### GET /process/current

인증된 관리자와 고용자가 가장 최근에 적재된 CSV replay의 현재 공정을 조회한다. 선택 query
`equipment_id`는 1 이상의 설비 ID이며 생략하면 replay에 공개된 전체 설비를 반환한다. 아직
replay가 없거나 공개된 레코드가 없으면 200과 빈 `items`를 반환한다.

| 응답 필드 | 형식·의미 |
| --- | --- |
| queried_at | 서버가 조회한 UTC RFC 3339 시각 |
| replay_id | 최신 replay ID. replay가 없으면 null |
| replay_state | `ready`, `running`, `delayed`, `completed`, `failed`. replay가 없으면 null |
| data_time | replay에서 마지막으로 공개한 원본 데이터 시각. 공개 전이면 null |
| last_advanced_at | 마지막 정상 공개 시각. 공개 전이면 null |
| items | 설비별 공개된 최신 레코드 목록. `equipment_code` 오름차순 |

각 item은 `equipment_id`, `equipment_code`, `equipment_name`, `equipment_status`,
`product_id`, `product_code`, `product_name`, `cycle_time_seconds`, `occurred_at`,
`available_at`, `is_demo`를 포함한다. 품목이 없으면 품목 세 필드는 null이며 CSV에 설비 상태가
없으므로 현재 `equipment_status`는 `unknown`이다. `cycle_time_seconds`는 정밀도 보존을 위해
JSON 문자열 또는 null로 전송한다. 인증 쿠키가 없거나 유효하지 않으면 401
`AUTHENTICATION_REQUIRED`, `equipment_id`가 1 미만이면 422를 반환한다.

### 필드·응답 기술 기본안

- 목록: `items`, `pagination: {page, page_size, total_items, total_pages}`. 빈 결과는 items=[]·total_items=0·total_pages=0. page>=1, page_size 1~100. 번호 10개 묶음은 FE 표시 규칙이다.
- 검색 query: q, page, page_size, sort_by, sort_order(asc/desc). 필터는 equipment_id·product_id·status·category·from/to 등 영역별 허용 필드만 사용한다. 인식하지 못한 정렬 필드는 검증 오류이며 SQL 식으로 전달하지 않는다.
- 정렬 기본값: 보고 created_at DESC,id DESC, 대화 updated_at DESC,id DESC, 일정 시작 ASC,id ASC, 원장 created_at DESC,id DESC. 수정 이력은 version DESC. 필드 추가는 실제 화면에 맞춰 문서화한다.
- 일반 기간은 from 포함·to 제외로 내부 조회한다. 화면의 날짜 포함 범위는 한국 시간 경계로 변환한다. 종일 일정은 start_date·end_date_exclusive, 시간 지정은 starts_at·ends_at이며 두 형식 혼용을 검증 오류로 처리한다.
- 401 인증 실패, 403 허용되지 않은 업무 동작, 404 없거나 소유 범위 밖인 단건, 409 버전·요청 키·상태 충돌, 422 입력 오류, 503 AI 설정 미비를 기술 기본안으로 사용한다. 외부 호출 실패는 작업 state와 safe_error_message로 안내한다.
- version은 요청에서 기대하는 현재 버전이며 성공 응답에 새 version을 포함한다. 충돌 응답은 최신 버전을 안내하되 현재 조회 권한이 없는 데이터는 포함하지 않는다. 사용자 입력 보존은 FE 동작으로 함께 계약 검토한다.
- 오류: `{"code":"VERSION_CONFLICT","message":"다른 변경이 먼저 저장되었습니다.","request_id":"..."}`. 입력 오류만 details에 필드별 안내를 추가한다.
- 데이터 없음은 수치 0과 구분해 nullable 값·missing_reason을 제공한다. 시연 값은 is_demo와 data_cutoff_at 등으로 명시한다.
- 비동기 상태는 DOMAIN_MODEL.md를 따른다. MVP는 상태 조회 polling으로 완료·실패 알림을 구성하는 기본안이며 SSE·스트리밍을 추가하지 않는다.

쿠키·CSRF와 프런트의 알림·입력 보존·날짜 변환은 FE/BE 상세 계약 확인이 필요하다. 이 문서 작성만으로 FE를 변경하거나 최종 연동을 완료한 것으로 간주하지 않는다.

### 인증 현재 구현 범위 (2026-11-23)

- 구현: `POST /auth/login`, `POST /auth/refresh`, `POST /auth/logout`, `GET /auth/me`, `PATCH /auth/password`, `POST /users`, `POST /users/{user_id}/password-reset`
- 비밀번호: Argon2id 해시(`argon2-cffi`). 사번이 없어도 같은 비용의 더미 해시를 검증해 응답 시간 차이를 줄인다
- 잠금: 같은 계정 5회 연속 실패 시 5분 제한(설정값). 잠긴 동안 올바른 비밀번호도 거부하고 `Retry-After`를 반환한다
- 쿠키: `imleader_access_token`(Path `/`), `imleader_refresh_token`(Path `/api/v1/auth`)은 HttpOnly·SameSite=Lax, `imleader_csrf_token`(Path `/`)은 JS가 읽는다. Secure는 `APP_AUTH_COOKIE_SECURE`
- 토큰: 액세스 JWT 15분, 리프레시 JWT 7일(최초 로그인 기준). 리프레시 원문은 저장하지 않고 SHA-256 digest만 `refresh_credential`에 저장
- 갱신: 리프레시를 제출하면 세대가 1 증가한 새 자격 증명을 발급하고 이전 행에 `consumed_at`을 기록한다. 새 만료는 세션의 `absolute_expires_at`을 넘지 않는다
- 재사용 감지: 소비·폐기된 리프레시가 다시 제출되면 세션과 현재 리프레시를 폐기하고 `SESSION_REVOKED`를 반환한다. 다른 기기 세션은 유지한다(DEC-107)
- 동시 갱신: 같은 세션의 직전 세대를 `APP_REFRESH_REUSE_GRACE_SECONDS`(기본 10초) 안에 다시 보내면 재사용으로 보지 않고 `REFRESH_IN_PROGRESS`(409)만 반환한다. FE는 잠시 후 재시도한다
- 로그아웃: 해당 세션의 리프레시를 폐기하고 쿠키를 지운다. 이미 발급된 액세스 토큰은 남은 만료(최대 15분)까지 유효하다(DEC-054)
- CSRF: 로그인 시 더블 서브밋 쿠키를 발급하고, `POST /auth/refresh`·`POST /auth/logout`·`PATCH /auth/password`·`POST /users`·`PATCH /users/{user_id}`·`POST /users/{user_id}/password-reset`·`POST /users/{user_id}/deactivation`·`POST /users/{user_id}/reactivation`는 `X-CSRF-Token` 헤더가 쿠키와 일치해야 한다. 불일치는 `CSRF_VALIDATION_FAILED`(403)
- 비밀번호 변경: 현재 비밀번호를 다시 검증하고 새 Argon2id 해시로 교체한다. `must_change_password`와 임시 비밀번호 만료 시각을 해제하고 사용자 version을 증가시킨다. 현재 비밀번호 불일치는 `CURRENT_PASSWORD_MISMATCH`, 같은 비밀번호 재사용은 `PASSWORD_UNCHANGED`(각 400)로 반환한다
- 임시 비밀번호: 계정 생성·관리자 초기화 시 `APP_TEMPORARY_PASSWORD_TTL_SECONDS`(기본 86400초) 뒤 만료 시각을 기록한다. 만료된 임시 비밀번호 로그인은 `401 TEMPORARY_PASSWORD_EXPIRED`다. `must_change_password=true`인 계정은 업무 API에서 `403 PASSWORD_CHANGE_REQUIRED`를 받고 본인 조회와 비밀번호 변경만 허용한다
- 관리자 초기화: 아래 `POST /users/{user_id}/password-reset` 계약을 따른다. 사용자 관리 API는 아래 구현 범위를 따른다
- 오류: 모든 HTTP·입력 검증·서버 오류는 최상위 `{code,message,request_id}` 형식으로 반환한다. 입력 오류만 안전한 필드별 `details`를 추가하며 예상하지 못한 서버 오류의 내부 정보는 노출하지 않는다. 주요 code는 `INVALID_CREDENTIALS`, `ACCOUNT_LOCKED`, `TEMPORARY_PASSWORD_EXPIRED`, `AUTHENTICATION_REQUIRED`, `PASSWORD_CHANGE_REQUIRED`, `INVALID_REFRESH_TOKEN`, `SESSION_REVOKED`, `REFRESH_IN_PROGRESS`, `CSRF_VALIDATION_FAILED`, `CURRENT_PASSWORD_MISMATCH`, `PASSWORD_UNCHANGED`, `EMPLOYEE_NO_ALREADY_EXISTS`, `USER_NOT_FOUND`, `SELF_PASSWORD_RESET_NOT_ALLOWED`, `SELF_ROLE_CHANGE_NOT_ALLOWED`, `SELF_DEACTIVATION_NOT_ALLOWED`, `LAST_ADMIN_REQUIRED`, `ACCOUNT_ALREADY_INACTIVE`, `ACCOUNT_ALREADY_ACTIVE`, `VERSION_CONFLICT`, `FORBIDDEN`이다
- 최초 관리자: `python -m app.commands.seed_accounts --employee-no ... --display-name ... --role admin`으로 준비한다. 같은 사번이 있으면 덮어쓰지 않고 종료 코드 1로 알린다. 이후 계정은 `POST /users`로 생성한다

### POST /users

관리자가 계정을 생성한다. 액세스 쿠키와 `X-CSRF-Token`이 필요하다. 요청의 `role`은
`admin` 또는 `worker`, 사번은 50자 이하, 표시 이름은 100자 이하의 공백이 아닌 문자열이다.
`shift_start_local`과 `shift_end_local`은 사용자별 한국 현지 근무 시각이다. 삭제 계정까지 포함해
사번을 재사용할 수 없으며 중복이면 `409 EMPLOYEE_NO_ALREADY_EXISTS`를 반환한다.

성공 시 `201`과 `user_id`, `employee_no`, `display_name`, `role`, `shift_start_local`,
`shift_end_local`, `temporary_password`, `must_change_password=true`, `version`을 반환한다.
임시 비밀번호는 영문 대소문자와 숫자를 포함한 16자이며 Argon2id 해시만 저장한다. 원문 응답은
`Cache-Control: no-store`이고 관리자 화면에서 한 번만 표시한다.

### POST /users/{user_id}/password-reset

관리자가 다른 사용자의 비밀번호를 임시 비밀번호로 초기화한다. 액세스 쿠키 인증과
`X-CSRF-Token` 더블 서브밋 검증이 필요하다. 요청 본문은 없다. `user_id`는 1 이상의 정수다.

| 응답 필드 | 형식·의미 |
| --- | --- |
| user_id | 초기화한 사용자 ID |
| employee_no | 초기화한 사용자의 사번 |
| temporary_password | 이번 응답에서만 제공하는 16자 임시 비밀번호 |
| must_change_password | 항상 true. 다음 로그인 후 본인 비밀번호 변경이 필요하다 |
| version | 초기화 후 증가한 사용자 version |

- 임시 비밀번호는 영문 대소문자와 숫자를 포함한 16자다. Argon2id 해시만 `app_user.password_hash`에
  저장하며 원문은 DB·서버 로그에 남기지 않는다. 응답은 `Cache-Control: no-store`다.
- 대상 사용자 행을 잠그고 한 트랜잭션에서 비밀번호 교체, `must_change_password=true`, version 증가,
  로그인 실패 횟수·잠금 해제를 처리한다(DEC-203).
- 대상 사용자의 모든 로그인 세션과 리프레시 자격 증명을 폐기한다. 이후 기존 액세스 토큰은 세션
  폐기 검사에서 거부되며, 새 임시 비밀번호로 로그인해야 한다. 다른 사용자의 세션은 유지한다.
- 관리자는 자기 자신을 대상으로 초기화할 수 없다. 본인 비밀번호는 `PATCH /auth/password`로 바꾼다.
- 오류: 인증 없음 `401 AUTHENTICATION_REQUIRED`, 관리자 아님 `403 FORBIDDEN`, 본인 대상
  `403 SELF_PASSWORD_RESET_NOT_ALLOWED`, 없거나 삭제된 사용자 `404 USER_NOT_FOUND`, `user_id`가
  1 미만이면 `422 VALIDATION_ERROR`, CSRF 불일치는 `403 CSRF_VALIDATION_FAILED`다. 모든 오류는
  최상위 `{code,message,request_id}` 형식을 따른다.
- 검증: 서비스·API 단위 테스트와 별도 일회용 PostgreSQL 18 DB에서 로그인·세션 폐기·soft delete
  사용자 404·본인 403을 확인했다. 전체 pytest 160건, Ruff, mypy를 통과했다.

### 사용자 관리 현재 구현 범위 (2026-11-23)

- `GET /users`: 관리자 전용 목록이다. `q`는 사번·이름 부분 일치(공백만이면 전체), `role`은 `admin`/`worker`,
  `include_inactive`는 비활성 계정 포함 여부다. `page`(기본 1), `page_size`(기본 10, 최대 100)와 DEC-122
  페이지네이션을 적용하고 사번 오름차순으로 정렬한다. 응답 item은 `user_id`, `employee_no`,
  `display_name`, `role`, `is_active`, 근무 시작·종료, `version`을 포함한다
- `GET /users/{user_id}`: 관리자 전용 상세다. 비활성 계정도 조회하며 `deactivated_at`(soft delete 시각),
  `must_change_password`, 생성·수정 시각을 포함한다. 없으면 `404 USER_NOT_FOUND`다
- `PATCH /users/{user_id}`: `version`, 선택 `display_name`, `role`, `shift_start_local`, `shift_end_local`을
  받는다. 생략한 필드는 유지하고 최소 한 필드를 요구한다. version이 다르면 `409 VERSION_CONFLICT`,
  본인 역할 변경은 `403 SELF_ROLE_CHANGE_NOT_ALLOWED`, 마지막 활성 관리자 강등은
  `409 LAST_ADMIN_REQUIRED`다. 변경 필드의 전후 값은 감사 이력에 남기고 비밀번호 관련 값은 남기지 않는다
- `POST /users/{user_id}/deactivation`: `version`을 받아 soft delete한다. 본인 비활성화는
  `403 SELF_DEACTIVATION_NOT_ALLOWED`, 마지막 활성 관리자 비활성화는 `409 LAST_ADMIN_REQUIRED`,
  이미 비활성이면 `409 ACCOUNT_ALREADY_INACTIVE`다. 대상의 모든 로그인 세션과 리프레시 자격 증명을
  폐기하고 사용자 version을 증가시킨다(DEC-205)
- `POST /users/{user_id}/reactivation`: `version`을 받아 `deleted_at`을 해제한다. 이미 활성이면
  `409 ACCOUNT_ALREADY_ACTIVE`다. 삭제 복구 기능(DEC-093)과 달리 계정 재활성화만 관리자에게 허용한다
- `GET /users/{user_id}/audit-events`: 관리자 전용 감사 이력이다. 계정 생성·비밀번호 초기화·정보 수정·
  비활성화·재활성화 이벤트를 `account_audit_event`에서 최신순으로 조회한다. 임시 비밀번호 원문과 만료
  시각은 저장하지 않는다. 대상 계정이 없으면 `404 USER_NOT_FOUND`다
- 초기 CLI 시드 계정의 비밀번호는 시간 만료를 적용하지 않는다. API로 발급한 임시 비밀번호만
  `APP_TEMPORARY_PASSWORD_TTL_SECONDS`(기본 86400초) 뒤 만료된다
- 검증: 서비스·API 단위 테스트 160건, Ruff, mypy 통과. 별도 일회용 PostgreSQL 18 DB에 Alembic head를
  적용해 계정 생성·초기화·목록·수정·비활성화·재활성화·감사 기록과 세션 폐기를 확인했다
- FE 관리자 계정 관리 화면과 임시 비밀번호 1회 표시·복사 UI는 FE 작업으로 남긴다(DEC-204 후속 범위)

### 근무 세션 현재 구현 범위 (2026-11-23)

- 로그인 시 한국 시간의 사용자별 기본 근무 종료 시각을 로그인 세션에 저장한다. 이미 종료 시각이 지났다면 재로그인 시점부터 1시간을 기본값으로 사용한다
- `GET /work-session`은 `ends_at`, 10분 전인 `warning_starts_at`, `server_time`, `version`을 반환한다
- `POST /work-session/extensions`는 `kind`, `expected_ends_at`, 선택 `ends_at`을 받는다. 수동 연장은 지정 시각 또는 현재 종료에서 1시간, 자동 연장은 종료 10분 전 구간에서만 1시간을 적용한다
- 같은 세션의 동시 요청은 행 잠금과 `expected_ends_at` 비교로 한 번만 반영한다. 자동 연장은 같은 종료 예정 시각당 한 번만 허용하고 모든 성공 연장을 `work_extension`에 기록한다
- 연장 종료는 최초 로그인 기준 리프레시 7일 상한을 넘지 않는다. 종료된 세션은 업무 인증과 토큰 갱신을 거부한다

### FE 연동 계약 (인증)

- base URL은 `/api/v1`, 요청은 `credentials: "include"`로 보내야 쿠키가 오간다
- CORS: `APP_CORS_ORIGINS`에 나열한 출처만 허용하고 자격 증명을 허용한다. 개발 기본값은 `http://localhost:5173`, `http://localhost:5174`
- 쿠키: `imleader_access_token`(Path `/`, 액세스 JWT), `imleader_refresh_token`(Path `/api/v1/auth`), `imleader_csrf_token`(Path `/`, JS가 읽는 CSRF 토큰)
- 로그인·갱신 응답은 사용자 객체만 반환하고 토큰 원문을 JSON에 넣지 않는다. `Cache-Control: no-store`가 붙는다
- 인증 실패는 `401` + 최상위 `code`: 잘못된 자격 증명 `INVALID_CREDENTIALS`, 잠금 `ACCOUNT_LOCKED`(`Retry-After`), 쿠키 없음·만료 `AUTHENTICATION_REQUIRED`
- 상태 변경 요청(`POST /auth/refresh`, `POST /auth/logout`, `PATCH /auth/password`, `POST /users`, `PATCH /users/{user_id}`, `POST /users/{user_id}/password-reset`, `POST /users/{user_id}/deactivation`, `POST /users/{user_id}/reactivation`)은 쿠키의 `imleader_csrf_token` 값을 `X-CSRF-Token` 헤더로 함께 보낸다. 헤더가 없거나 다르면 `CSRF_VALIDATION_FAILED`(403)
- 관리자 비밀번호 초기화·계정 생성 응답의 `temporary_password`는 화면에 한 번 표시한 뒤 보관하지 않는다. 응답은 `Cache-Control: no-store`이며, `403 SELF_PASSWORD_RESET_NOT_ALLOWED`·`403 SELF_ROLE_CHANGE_NOT_ALLOWED`·`403 SELF_DEACTIVATION_NOT_ALLOWED`는 해당 작업이 불가함을 안내한다
- `403 PASSWORD_CHANGE_REQUIRED`는 임시 비밀번호 변경 전 업무 API 차단이다. FE는 비밀번호 변경 화면으로 이동하고, `401 TEMPORARY_PASSWORD_EXPIRED`는 관리자 재발급 안내로 처리한다
- 액세스 만료 대응: 업무 API에서 `401 AUTHENTICATION_REQUIRED`를 받으면 `POST /auth/refresh`를 한 번 호출하고, 성공하면 원래 요청을 재시도한다. `INVALID_REFRESH_TOKEN`·`SESSION_REVOKED`면 로그인 화면으로 보낸다
- 동시 갱신 처리: `409 REFRESH_IN_PROGRESS`는 로그아웃이 아니라 재시도 신호다. FE는 갱신 요청을 한 번에 하나만 보내고, 409를 받으면 `Retry-After`(1초) 후 현재 리프레시 쿠키로 다시 시도한다
- 로그아웃: `POST /auth/logout` 성공(204) 후 클라이언트 상태를 초기화한다. 서버가 쿠키를 지우므로 별도 삭제는 필요하지 않다

## 구현 시 상세 확인

필수값은 FE가 전송 전에 검사해 사용자에게 안내하고 BE도 요청에서 검증한다. 부분 수정에서 생략은 기존 값 유지, nullable 필드의 null은 값 제거, 필수값의 null은 검증 오류로 처리한다. 필드별 생략·null 허용 여부를 명세한다(DEC-155).

- 필수·선택·null 의미와 요청·응답 필드별 런타임 검증
- 페이지 메타데이터, 검색·필터·정렬 파라미터 이름과 기본값
- 작업 상태 코드, 요청 재전송 식별자, 버전 충돌 응답
- CSRF 방식 확정(더블 서브밋 쿠키, `imleader_csrf_token` + `X-CSRF-Token`)과 배포 출처별 쿠키·CORS 세부값 확인
- 공정 CSV의 시간대·필드와 내부 데이터 모델의 매핑
- DEC-153의 문서화 방식에 따른 실제 OpenAPI 화면 구현과 계약·구현 일치 검증

전체 업무 규칙은 [REQUIREMENTS.md](REQUIREMENTS.md), 합의 과정은 [DECISION_HISTORY.md](DECISION_HISTORY.md)를 참조한다.
