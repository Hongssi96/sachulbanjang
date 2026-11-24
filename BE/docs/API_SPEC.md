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
| 공정 | 구현 중 | 핵심 스키마·CSV 적재·5초 재생·정상 종료·15초 지연 판정, 현재 공정 조회, 생산 이력 목록·상세 조회(기간·설비·품목 필터·페이지네이션), 관리자 정정과 변경 이력 조회 구현. 전체 pytest 및 PostgreSQL 18 replay·이력·정정 검증. FE polling·이력 화면 연동 미확인 | 2026-11-23 |
| 마스터·담당 | 구현 완료 | 부서·라인·설비·제품 활성 목록 조회와 본인 담당 조회, 사용자 담당 테이블·조직/담당 초기 데이터 적재 명령 구현. pytest 192건 및 PostgreSQL 18 통합 검증. 담당 배정·변경 관리 화면은 추후 | 2026-11-23 |
| 보고서·이력 | 구현 완료 | 보고서 목록·상세·수동 생성, 제목·본문 수정, 관리자 상태 변경, soft delete, 수정 이력·상태 이력 조회, 생성 작업 접수·조회·취소·재시도와 PostgreSQL 작업 큐(claim/lease/heartbeat·중단 정리), OpenAI 호환 AI worker·집계 스냅샷·성공 보고서 원자적 등록 구현. 같은 조건 완료 보고서 반환·명시적 재생성, 저장 집계 기반 PDF·불량 유형 그래프·다운로드 이력 구현. version 충돌·작성자/관리자 권한 적용 | 2026-11-23 |
| 검사·품질 | 구현 중 | 검사 기록 테이블과 검사 이력 목록·상세 조회(기간·설비·품목·판정 필터·페이지네이션), 관리자 정정·변경 이력, 품질 통계(양품·불량·미분류·불량률·생산 기록 건수) 구현. 가동률·삭제 미착수. pytest 257건 및 PostgreSQL 18 검증 | 2026-11-23 |
| AI 대화 | 미착수 | - | 2026-11-20 |
| 일정 | 구현 완료 | 달력 범위·목록 페이지 조회, 종일/시간 지정 등록·수정·soft delete, 관리자 전체·고용자 본인 권한, version 충돌 처리 구현. 반복·복사 제외. pytest 272건 및 PostgreSQL 18 통합 검증 | 2026-11-23 |
| 재고 | 구현 완료 | 현재 잔고·거래 원장 조회, 입고·출고·조정·정정·확인, 음수 차단과 제품 행 잠금, 관리자 사후 확인, 최소 재고 설정과 부족 표시 구현. pytest 291건 및 PostgreSQL 18 통합 검증. 생산 자동 입고는 제외 | 2026-11-23 |
| 인수인계 | 구현 완료 | 노트 작성·목록·상세, 담당 대상 연결과 본인 담당 기본 필터, 작성자 본인 수정·관리자/본인 soft delete, 사용자별 멱등 확인 처리 구현. pytest 312건 및 PostgreSQL 18 통합 검증. 알림·복구는 추후 | 2026-11-23 |

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
| GET /assignments/me | 없음 | 본인. 부서·라인·설비 복수 배정을 id·코드·이름으로 반환 |
| GET /departments | 없음 | 관리자·고용자. 활성 부서 전체 |
| GET /production-lines | department_id? | 관리자·고용자. 활성 라인(부서 필터) |
| GET /equipment | production_line_id? | 관리자·고용자. 활성 설비(라인 필터). 품목 선택 목록은 /products |
| GET /products | q? | 관리자·고용자. 활성 제품(이름·코드 부분 검색) |
| GET /process/current | 설비·품목과 최근 수치·시연·재생 상태 | 관리자·고용자 전체 |
| GET /process-records, /inspection-records | 기간·설비·품목·판정 조건 | 페이지 목록 |
| GET /process-records/{id}, /inspection-records/{id} | 개별 기록 | 일반 조회 권한 |
| PATCH /process-records/{id} | version, change_reason, occurred_at?, cycle_time_seconds?, product_id?, equipment_id? | 관리자, CSRF. 원천 식별자·is_demo 변경 불가 |
| PATCH /inspection-records/{id} | version, change_reason, inspected_at?, product_id?, process_record_id?, verdict?, defect_type?, reason? | 관리자, CSRF. 원천 식별자·is_demo 변경 불가 |
| DELETE /process-records/{id}, /inspection-records/{id} | expected_version·사유를 query/header 계약으로 확정 | 관리자 soft delete·감사 이력. 미구현 |
| GET /process-records/{id}/changes, /inspection-records/{id}/changes | 없음 | 관리자만. 전후 값·사유·작업자·시각 |
| GET /quality/summary | from·to·equipment_id·product_id | 관리자·고용자. 검사·양품·불량 건수, 불량률(null 허용), 유형 분포, 생산 기록 건수 |
| GET /quality/operation | 한국 기준 날짜·설비 | 계획/실제 시간·가동률·is_demo |
| POST /report-duplicate-checks | report_kind, period, targets | 조회 가능한 동일 조건 보고서만 안내 |
| POST /report-jobs | client_request_key, report_kind, category, period, targets | 202: job_id, state, accepted_at, data_cutoff_at. 같은 키·같은 내용은 기존 작업 반환, 다른 내용은 409 |
| GET /jobs, GET /jobs/{id} | kind?, state?, page, page_size | 요청자 본인. 상태·safe_error_message·report_id |
| POST /jobs/{id}/cancel | 없음 | 본인. 비종료 작업만 취소 |
| POST /jobs/{id}/retry | 새 client_request_key | 본인. failed·interrupted만, 새 job_id·기준 시각 |
| POST /reports | title, body_markdown, category, report_kind | 작성자·관리자, CSRF. AI 생성 전 임시 수동 등록 |
| GET /reports | q, category, business_status, from, to, page, page_size | 관리자 전체·고용자 본인 |
| GET /reports/{id} | 없음 | 관리자 전체·고용자 본인. 삭제 보고는 404 |
| PATCH /reports/{id} | version, title?, body_markdown? | 관리자 전체·고용자 완료 전 본인. version 충돌 409 |
| PATCH /reports/{id}/status | version, business_status | 관리자만. 전이 검사·상태 이벤트 기록 |
| DELETE /reports/{id}?expected_version= | expected_version | 관리자 전체·고용자 완료 전 본인. soft delete |
| GET /reports/{id}/revisions, /revisions/{version} | 읽기 전용 과거 제목·본문 | 현재 보고서 조회 권한 |
| GET /reports/{id}/status-events | 전후 상태·작업자·시각 | 현재 보고서 조회 권한 |
| GET /reports/{id}/pdf?version=... | 선택 버전 PDF 생성 | 조회 권한. 파일 응답, 다운로드 이벤트 |
| GET /reports/{id}/downloads | 다운로드 사용자·시각·버전, 합계 | 현재 보고서 조회 권한 |
| GET /reports/{id}/charts/{chart_key}?version=... | 저장 집계 기반 이미지 생성·재시도 | 조회 권한. 실패 시 JSON 오류+사유, 화면/PDF 대체 안내 |
| POST /conversations, GET /conversations | 본인 대화 생성·검색 | 제목·질문·답변 검색, 최근 활동 기간 필터 |
| GET /conversations/{id}, DELETE /conversations/{id} | 본인 조회·soft delete | 관리자도 타인 대화 불가. 진행 중 작업은 취소 |
| POST /conversations/{id}/turns | question, client_request_key | 202: turn_id, job_id, state. 생성 중 질문이 있으면 409 |
| POST /conversations/{id}/turns/{turn_id}/refresh | 새 요청 키·기존 조건 기반 최신 재조회 | 새 질문·답변 추가. 실패 재시도와 구분 |
| GET /schedules | from·to(한국 기준, 양 끝 포함), page, page_size | 양 역할. 범위와 겹치는 일정을 시작 순 반환 |
| POST /schedules | title, category, description?, all_day, 종일 또는 시간 지정 필드 | 양 역할, CSRF |
| GET /schedules/{id} | 없음 | 양 역할 전체 조회 |
| PATCH /schedules/{id} | version + 변경 필드(날짜·시각 혼용 금지) | 관리자 전체·고용자 본인, CSRF. version 충돌 409 |
| DELETE /schedules/{id}?expected_version= | expected_version | 관리자 전체·고용자 본인, CSRF. soft delete |
| GET /handover-notes | q, department_id/production_line_id/equipment_id, include_all, page, page_size | 양 역할. 고용자 기본 본인 담당 필터 |
| POST /handover-notes | body, targets?(생략 시 작성자 담당) | 양 역할, CSRF |
| GET /handover-notes/{id} | 없음 | 양 역할 전체 조회. 대상·확인 정보 포함 |
| PATCH /handover-notes/{id} | version, body?, targets? | 작성자 본인만(관리자도 타인 불가), CSRF |
| DELETE /handover-notes/{id}?expected_version= | expected_version | 관리자 전체·고용자 본인, CSRF. soft delete |
| PUT /handover-notes/{id}/confirmation | 없음 | 본인 확인 기록. 반복 요청은 기존 기록 반환(중복 생성 없음) |
| GET /stocks | q, low_stock, page, page_size | 양 역할 전체. 수량·최소 재고·부족 여부 |
| GET /stock-movements | product_id, kind, from, to, page, page_size | 양 역할 전체. 원장·확인 여부 |
| POST /stock-movements | product_id, kind(initial/receipt/issue/adjustment), quantity, reason? | 양 역할, initial은 관리자. 음수 차단·즉시 반영 |
| POST /stock-movements/{id}/corrections | delta(≠0), reason | 관리자 또는 확인 전 원작성자, 별도 원장 |
| POST /stock-movements/{id}/confirmation | 없음 | 관리자만. 전후 상태 확인 기록 |
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

### 생산·검사 이력 조회 현재 구현 범위 (2026-11-23)

관리자와 고용자 모두 조회할 수 있다(DEC-058). `available_at`이 null인 미공개 적재 행도 이력에는
포함하고 응답의 `available_at`으로 구분한다(DEC-206). soft delete된 기록은 제외한다.

- `GET /process-records`: 선택 query `equipment_id`(1 이상), `product_id`(1 이상), `from`, `to`(한국 기준
  날짜, `from` 포함·`to` 제외), `page`(기본 1), `page_size`(기본 10, 최대 100). `occurred_at` 내림차순,
  `id` 내림차순으로 정렬한다
- `GET /process-records/{record_id}`: 개별 공정 기록. 응답에 `source_import_id`, `source_row_number`를
  포함한다
- `GET /inspection-records`: `equipment_id`, `product_id`, `verdict`, `from`, `to`, `page`, `page_size`.
  `verdict`는 `good`(양품)·`defect`(불량)이며 `inspected_at` 내림차순, `id` 내림차순으로 정렬한다
- `GET /inspection-records/{record_id}`: 개별 검사 기록
- 목록 응답은 `items`와 `pagination: {page, page_size, total_items, total_pages}`를 반환한다. 항목은
  설비 코드·이름, 품목 코드·이름(nullable), `cycle_time_seconds`(JSON 문자열 또는 null), 시각,
  `is_demo`, `version`을 포함한다. 검사 항목은 `process_record_id`, `verdict`, `defect_type`(null이면
  화면·집계에서 ‘미분류’), `reason`을 포함한다
- 없거나 삭제된 `{record_id}`는 `404 RECORD_NOT_FOUND`, `from`이 `to`보다 늦으면 `422 VALIDATION_ERROR`,
  인식하지 못한 `verdict`·0 이하 ID·페이지 범위 밖 값은 `422 VALIDATION_ERROR`다
- `inspection_record` 테이블과 이력 조회 인덱스를 마이그레이션 `20261123_0009`로 추가했다. 실제 자동
  검사 데이터가 없으므로 현재 검사 이력은 비어 있을 수 있으며 시연·실데이터는 별도 적재가 필요하다
- 검증: pytest 176건(Ruff·mypy 포함), 별도 일회용 PostgreSQL 18 DB에서 필터·페이지네이션·기간 경계
  (한국 시간→UTC 변환)·정렬·soft delete 제외·판정 필터·삭제 설비 이력 보존·미공개 행 포함·인덱스
  생성을 확인했다

### 마스터·담당 현재 구현 범위 (2026-11-23)

관리자와 고용자 모두 사용할 수 있는 선택 목록 API다. 활성 데이터(`deleted_at IS NULL`)만
반환하며 페이지네이션 없이 전체 목록을 준다(DEC-207).

- `GET /departments`: 활성 부서를 `code` 오름차순으로 반환한다. 각 항목은 `department_id`, `code`, `name`
- `GET /production-lines`: 선택 `department_id`(1 이상)로 필터한다. `production_line_id`, `department_id`,
  `code`, `name`을 반환하고 부서·코드 순으로 정렬한다
- `GET /equipment`: 선택 `production_line_id`(1 이상)로 필터한다. `equipment_id`, `equipment_code`,
  `name`, `production_line_id`(nullable)을 반환하고 설비 코드 순으로 정렬한다
- `GET /products`: 선택 `q`로 이름·제품 코드를 부분 일치 검색한다(공백만이면 전체). `product_id`,
  `product_code`(nullable), `name`을 반환하고 이름 순으로 정렬한다
- `GET /assignments/me`: 로그인 사용자의 활성 담당을 `departments`, `production_lines`, `equipment`
  세 배열로 반환한다. 담당 대상이 soft delete되면 그 항목은 제외하고 담당 배정은 삭제하지 않는다
- 담당 배정·변경 관리 화면과 API는 추후 범위다(DEC-130). 초기 조직·담당 데이터는 `python -m app.commands.seed_master_data --file <JSON>`로 준비한다(README 참고)
- 검증: pytest 192건(Ruff·mypy 포함), 별도 일회용 PostgreSQL 18 DB에서 활성 필터·필터·정렬·담당 그룹화·
  soft delete 대상 제외·적재 명령 중복 방지·실패 롤백을 확인했다

### 생산·검사 기록 관리자 정정 현재 구현 범위 (2026-11-23)

관리자만 실행할 수 있고 CSRF 더블 서브밋을 요구한다(DEC-158·DEC-162·DEC-208). 삭제(soft delete)는
이번 범위에 포함하지 않는다.

- `PATCH /process-records/{id}`: `version`(필수), `change_reason`(필수, 공백 불가), 선택 필드
  `occurred_at`·`cycle_time_seconds`·`product_id`·`equipment_id`. 원천 식별자(`source_import_id`,
  `source_row_number`, `source_namespace`, `source_record_key`, `source_payload`)와 `is_demo`·`version`은
  변경할 수 없다. `occurred_at`·`equipment_id`는 null을 허용하지 않는다
- `PATCH /inspection-records/{id}`: `version`(필수), `change_reason`(필수), 선택 필드 `inspected_at`·
  `product_id`·`process_record_id`·`verdict`·`defect_type`·`reason`. `inspected_at`·`verdict`는 null을
  허용하지 않고 `defect_type`·`reason`·연결 대상은 null로 비울 수 있다
- 두 API 모두 하나 이상의 수정 필드를 요구한다. 실제 값이 바뀌지 않으면 `422 VALIDATION_ERROR`,
  version이 다르면 `409 VERSION_CONFLICT`, 없거나 삭제된 기록은 `404 RECORD_NOT_FOUND`다
- 성공 시 사용자 version을 1 증가시키고 응답은 조회 상세와 같은 형식이며 `Cache-Control: no-store`다.
  수정한 필드의 전후 값·사유·작업자·시각·결과 version을 `record_change`(operation `update`)에 같은
  트랜잭션으로 기록한다
- `GET /process-records/{id}/changes`·`GET /inspection-records/{id}/changes`: 관리자만 조회한다.
  `items`에 `before_value`·`after_value`(변경 필드만)·`reason`·`actor_id`·`actor_display_name`·`version`·
  `occurred_at`을 최신순으로 반환한다
- 검증: pytest 211건(Ruff·mypy 포함), 별도 일회용 PostgreSQL 18 DB에서 정정 적용·version 충돌·무변경
  거부·null 비우기·감사 기록(전후 값·사유·작업자)·이력 정렬·soft delete 기록 404·원천 식별자 불변·
  인덱스 생성을 확인했다

### 보고서 기본 CRUD 현재 구현 범위 (2026-11-23)

AI 생성이 준비되기 전 임시로 수동 등록을 포함한 기본 CRUD를 제공한다(DEC-209). 생성·수정·삭제는
CSRF를 요구하고, 조회·수정·삭제 권한은 관리자 전체·고용자 본인이다.

- `POST /reports`: 작성자·관리자가 `title`, `body_markdown`, `category`, `report_kind`로 등록한다.
  상태는 `pending`, version은 1이며 최초 내용이 revision 1로 함께 저장된다
- `category`는 `equipment_issue`·`quality_report`·`inspection_done`·`periodic_weekly`·
  `periodic_monthly`·`other`, `report_kind`는 `general`·`weekly`·`monthly`다. `periodic_weekly`→`weekly`,
  `periodic_monthly`→`monthly`, 그 외는 `general`이어야 하며 불일치는 `422 VALIDATION_ERROR`다
- `GET /reports`: `q`(제목·본문 부분), `category`, `business_status`, `from`·`to`(한국 기준 작성 기간,
  `from` 포함·`to` 제외), `page`/`page_size`(기본 10·최대 100). `created_at` 내림차순·`id` 내림차순
- `GET /reports/{id}`: 본문을 포함한 상세. 고용자가 타인 보고를 요청하거나 삭제된 보고서는
  `404 REPORT_NOT_FOUND`다
- `PATCH /reports/{id}`: `version`과 `title`·`body_markdown` 중 하나 이상. 고용자는 본인 보고이며
  `completed`가 아닐 때만 수정할 수 있고, 완료 후에는 `403 REPORT_COMPLETED_LOCKED`다. version이
  다르면 `409 VERSION_CONFLICT`, 실제 변경이 없으면 `422 VALIDATION_ERROR`다. 성공 시 version을
  올리고 revision을 남기며 `last_editor_id`를 기록한다
- `PATCH /reports/{id}/status`: 관리자만. `pending→in_progress/completed`, `in_progress→completed`,
  `completed→in_progress`만 허용하고 그 외 전이는 `422 VALIDATION_ERROR`다. 전후 상태·작업자·시각을
  `report_status_event`에 기록하고 version을 올린다
- `DELETE /reports/{id}?expected_version=`: soft delete. 권한은 수정과 같고 version이 다르면
  `409 VERSION_CONFLICT`다
- `GET /reports/{id}/revisions`, `/revisions/{version}`: 조회 권한이 있으면 버전별 제목·본문·수정자·시각을
  확인한다. `GET /reports/{id}/status-events`는 상태 변경 이력을 최신순으로 반환한다
- 검증: pytest 230건(Ruff·mypy 포함), 별도 일회용 PostgreSQL 18 DB에서 생성·revision·목록 필터·
  작성자 범위·수정·version 충돌·무변경 거부·상태 전이·완료 잠금·soft delete·이력 정렬·인덱스 생성을
  확인했다. AI 생성·PDF·중복 안내·집계 스냅샷은 미착수다

### 보고서 생성 작업 기반 현재 구현 범위 (2026-11-23)

실제 AI 호출은 별도 작업으로 분리하고, 접수·상태·취소·재시도와 PostgreSQL 작업 큐 기반만 구현한다
(DEC-082·DEC-083·DEC-094·DEC-095·DEC-096·DEC-118·DEC-127·DEC-210).

- `POST /report-jobs`: 작성자·관리자가 `client_request_key`, `report_kind`, `category`, `period`,
  `targets`로 접수한다. `request_payload`를 정규화해 저장하고 SHA-256 digest로 중복을 판정한다.
  `data_cutoff_at`은 접수 시점의 최신 replay `data_time`, 없으면 접수 시각이다. 응답은 `202`와
  `job_id`, `state`, `accepted_at`, `data_cutoff_at`이다
- 같은 요청자·종류·`client_request_key` 재전송: digest가 같으면 기존 작업을 `202`로 반환하고,
  내용이 다르면 `409 REQUEST_KEY_CONFLICT`다. 동시 접수의 UNIQUE 충돌은 재조회로 흡수한다
- `GET /jobs`, `GET /jobs/{id}`: 요청자 본인 작업만 조회한다(타인은 404). `kind`·`state` 필터와
  DEC-122 페이지네이션을 적용하고 `completed` 뒤에는 `report_id`를 함께 반환한다
- `POST /jobs/{id}/cancel`: 비종료(`accepted`·`querying`·`writing`) 작업만 취소한다. 이미 종료된
  작업은 `409 JOB_NOT_CANCELLABLE`이며 등록된 보고서는 기존 보고서 권한을 따른다
- `POST /jobs/{id}/retry`: `failed`·`interrupted` 작업만 새 `client_request_key`로 재시도한다. 새
  작업은 `retry_of_id`와 증가한 `attempt_count`를 가지며 그 외 상태는 `409 JOB_NOT_RETRYABLE`이다
- 작업 상태: `accepted → querying → writing → succeeded`, 중간 `failed`, 임차 만료 `interrupted`,
  비종료 상태 `cancelled`. 전이는 DB에서 확정한다
- 큐: `claim_next_job`이 `accepted` 작업을 `FOR UPDATE SKIP LOCKED`로 잡아 `querying`으로 바꾸고
  임차(`lease_expires_at`)·`heartbeat_at`을 기록하며 `attempt_count`를 증가시킨다. `heartbeat_job`이
  임차를 연장하고, `fail_job`이 실패를 기록한다. `python -m app.commands.reap_report_jobs`가 임차가
  만료된 `querying`·`writing` 작업을 `interrupted`(`WORKER_INTERRUPTED`)로 정리한다. 서버 복구 후
  자동 재실행은 하지 않는다(DEC-094)
- 검증: pytest 250건(Ruff·mypy 포함), 별도 일회용 PostgreSQL 18 DB에서 접수·data_cutoff·중복 반환·
  키 충돌·요청자 범위·취소·재시도·claim/lease/heartbeat·임차 만료 interrupted·인덱스/UNIQUE를 확인했다
- 실제 AI 실행(`querying`·`writing` 단계와 `succeeded` 시 보고서 등록), 같은 조건 중복 안내
  (`POST /report-duplicate-checks`)는 후속 작업이다

### 대화 저장·조회와 채팅 작업 접수 현재 구현 범위 (2026-11-24)

AI 답변 생성은 보고서와 같은 `generation_job` 큐를 쓰는 별도 chat worker로 분리하고, 이번 범위에서는
대화·질문 저장, 작업 접수, 본인 조회·검색, soft delete까지 구현한다
(DEC-030·DEC-032~034·DEC-062·DEC-095·DEC-122~126·DEC-216).

- `POST /conversations`: `title`(1~200자)로 생성한다. CSRF가 필요하고 소유자는 로그인 사용자다.
  응답은 `201`과 빈 `turns`를 포함한 상세다
- `GET /conversations`: `q`(제목·질문·답변 부분 검색, 최대 100자), `from`·`to`(한국 기준 최근 활동
  기간, `from` 포함·`to` 제외), `page`/`page_size`(기본 10·최대 100). `updated_at` 내림차순·
  `id` 내림차순으로 `turn_count`와 함께 반환한다. 관리자도 본인 대화만 조회한다(DEC-032)
- `GET /conversations/{id}`: 질문·답변·작성 시각·데이터 기준 시각·시연 여부, 연결된 `job` 상태
  (`state`·`error_code`·`safe_error_message`), 근거 목록을 `turns`로 반환한다. 타인 대화·삭제
  대화는 `404 CONVERSATION_NOT_FOUND`이며 응답에 `Cache-Control: no-store`가 붙는다
- `DELETE /conversations/{id}`: CSRF가 필요하다. soft delete하고 진행 중인 채팅 작업을 취소하며
  `204`를 반환한다(DEC-034·DEC-062)
- `POST /conversations/{id}/turns`: `question`(1~1,000자), `client_request_key`(1~100자)를 받고
  CSRF가 필요하다. `chat_turn`과 `kind=chat` 작업을 한 트랜잭션으로 접수해 `202`와 `turn_id`·
  `job_id`·`state`·`accepted_at`·`data_cutoff_at`을 반환한다. 같은 요청 키·같은 내용은 기존 접수
  결과를 반환하고 내용이 다르면 `409 REQUEST_KEY_CONFLICT`다. 같은 대화에 생성 중
  (`accepted`·`querying`·`writing`) 작업이 있으면 `409 CHAT_TURN_IN_PROGRESS`다(DEC-125)
- `POST /conversations/{id}/turns/{turn_id}/refresh`: `client_request_key`만 받는다. 원래 질문과
  `query_scope`를 복사한 새 질문을 같은 대화에 추가해 최신 데이터 재조회를 접수한다. 실패 재시도와
  구분하며, 같은 대화에 생성 중 작업이 있으면 `409 CHAT_TURN_IN_PROGRESS`다(DEC-098)
- 채팅 작업 상태는 `GET /jobs?kind=chat`·`GET /jobs/{id}`로 조회하고 `POST /jobs/{id}/cancel`로
  취소한다. 화면은 이 상태로 데이터 조회 중·답변 작성 중을 표시한다(DEC-095·DEC-126)
- 검증: pytest 354건(Ruff·mypy 포함)으로 소유자 범위·검색·기간 필터·페이지네이션·soft delete·
  진행 중 질문 차단·요청 키 멱등/충돌·refresh 질문/조건 복사·채팅 작업 접수·API 오류 매핑을 확인했다.
  일회용 PostgreSQL 18 DB에서 Alembic head 적용, `ck_answer_evidence_source` 위반 거부, 인덱스 생성,
  `20261123_0018`↔`20261124_0019` downgrade/upgrade를 확인하고 DB를 삭제했다
- 미완료: AI 조회·답변 생성 chat worker, 답변 근거 기록, 근거 권한 상실·삭제 시 과거 답변 가림
  (DEC-099·DEC-100), 실패 재시도 API(DEC-124). 현재 `answer`·`evidence`는 worker가 채우기 전까지
  비어 있다

### 품질 통계 현재 구현 범위 (2026-11-23)

관리자·고용자 모두 조회한다(DEC-058). 필터 범위 전체를 집계하고 상세 검사 목록은 기존
`GET /inspection-records`(페이지네이션)를 재사용한다(DEC-210 후속, DEC-211).

- `GET /quality/summary`: 선택 query `from`·`to`(한국 기준 검사 기간, `from` 포함·`to` 제외),
  `equipment_id`(1 이상), `product_id`(1 이상)
- 응답 필드: `inspected_count`, `good_count`, `defect_count`, `defect_rate`, `defect_types`,
  `production_record_count`, `includes_demo`
- `defect_rate`는 `불량 ÷ (양품 + 불량) × 100`을 소수 둘째 자리로 반올림한 값이다. 판정 기록이 없어
  분모가 0이면 `null`이며 화면에서 ‘—’로 표시한다(DEC-029)
- `defect_types`는 불량 유형별 `{"type": <문자열 또는 null>, "count": n}` 목록이다. `type`이 null이면
  유형 없는 불량(‘미분류’)이며, 건수 내림차순·유형 오름차순(null 마지막)으로 정렬한다(DEC-165)
- `production_record_count`는 같은 기간·필터의 공정 기록 건수다. 실제 생산량이 아니며 화면에서도
  ‘생산 기록 건수’로 표시한다(DEC-190)
- soft delete된 검사·공정 기록은 제외한다. `includes_demo`는 집계 대상에 시연 기록이 포함됐는지
  나타낸다
- 검증: pytest 257건(Ruff·mypy 포함), 별도 일회용 PostgreSQL 18 DB에서 기간 경계·설비/품목 필터·
  soft delete 제외·불량률 반올림·분모 0 null·유형 분포 정렬·생산 기록 건수·시연 표시를 확인했다
- 가동률(`GET /quality/operation`)은 `operation_day` 작업에서 별도 구현한다

### 일정 현재 구현 범위 (2026-11-23)

관리자·고용자 모두 조회하고 생성할 수 있다. 수정·삭제는 관리자 전체·고용자 본인 일정만 가능하다
(DEC-035·DEC-036·DEC-037). 반복·복사는 이번 범위에서 제외한다(DEC-039).

- `GET /schedules`: 선택 query `from`·`to`(한국 기준 날짜, 양 끝 포함), `page`, `page_size`(기본 10·최대 100).
  `from`/`to`가 주어지면 해당 범위와 겹치는 일정만 반환한다. 종일 일정은 `start_date`·`end_date_exclusive`,
  시간 지정 일정은 시각 경계로 겹침을 판정한다. 시작 시각 오름차순·`id` 오름차순으로 정렬한다
- `POST /schedules`: `title`, `category`, 선택 `description`, `all_day`와 표현 필드를 받는다. `category`는
  `inspection`·`production`·`meeting`·`other`다
- 종일 일정: `all_day=true`에 `start_date`·`end_date_exclusive`(종료일 제외)를 받고 시각 필드는 비운다.
  시간 지정 일정: `all_day=false`에 `starts_at`·`ends_at`(오프셋 포함 UTC)을 받고 날짜 필드는 비운다.
  한 표현만 허용하며 종료가 시작보다 뒤여야 하고, 위반은 `422 VALIDATION_ERROR`다(DEC-168). DB CHECK로도 보장한다
- `GET /schedules/{id}`: 상세. 삭제된 일정은 `404 SCHEDULE_NOT_FOUND`
- `PATCH /schedules/{id}`: `version`과 변경 필드를 받는다. 생략한 필드는 유지하며 날짜·시각 필드를 한 요청에
  섞으면 `422`다. `all_day`를 바꾸려면 새 표현 필드를 함께 보내야 한다. version이 다르면 `409 VERSION_CONFLICT`,
  고용자가 타인 일정을 수정하면 `403 FORBIDDEN`, 실제 변경이 없거나 형식이 맞지 않으면 `422 VALIDATION_ERROR`다.
  성공 시 version을 올린다
- `DELETE /schedules/{id}?expected_version=`: soft delete. 권한은 수정과 같고 version이 다르면 `409`다
- 검증: pytest 272건(Ruff·mypy 포함), 별도 일회용 PostgreSQL 18 DB에서 종일/시간 지정 등록·범위 겹침 필터·
  권한(타인 403)·version 충돌·표현 전환·soft delete 제외·DB CHECK 제약·인덱스를 확인했다

### 재고 관리 현재 구현 범위 (2026-11-23)

관리자·고용자 모두 조회·등록하고, 초기 재고 등록·확인·최소 재고 설정은 관리자만 한다
(DEC-041·DEC-059·DEC-060·DEC-085~089·DEC-131·DEC-213).

- `GET /stocks`: 제품별 현재 수량과 최소 재고·부족 여부를 페이지로 반환한다. `q`(이름·코드 부분),
  `low_stock`(부족만), `page`/`page_size`. `is_low_stock`은 최소 재고가 있고 현재고가 그보다 적을 때 true다
- `GET /stock-movements`: 거래 원장을 페이지로 반환한다. `product_id`, `kind`, `from`·`to`(한국 기준,
  양 끝 포함) 필터와 최신순 정렬. 각 항목은 제품·유형·증감(`delta`)·사유·등록자·확인자·확인 시각을 포함한다
- `POST /stock-movements`: `product_id`, `kind`(`initial`·`receipt`·`issue`·`adjustment`), `quantity`,
  선택 `reason`을 받는다. 입고·출고·초기 재고는 수량이 1 이상, 조정은 목표 수량(0 이상)이며 사유가 필수다.
  초기 재고는 관리자만, 제품당 한 번만 허용한다. 응답은 거래 ID·유형·증감·`quantity_after`·확인 시각이다
- 음수 방지: 출고·조정·정정으로 현재고가 0 미만이 되면 `409 INSUFFICIENT_STOCK`이다. 조정은 목표 수량과
  현재고가 같으면 `422 VALIDATION_ERROR`다
- 동시성: 거래 등록·정정 시 제품 행을 `SELECT ... FOR UPDATE`로 잠가 같은 제품의 동시 변경을 직렬화하고,
  잔고는 원장과 같은 트랜잭션에서 갱신한다(DEC-139)
- 사후 확인: 관리자 등록 거래는 생성 시 확인 완료로 기록하고, 고용자 등록 거래만
  `POST /stock-movements/{id}/confirmation`으로 관리자가 확인한다. 이미 확인된 거래는 `409 STOCK_ALREADY_CHECKED`다
- `POST /stock-movements/{id}/corrections`: `delta`(≠0)와 사유로 원거래를 보존한 별도 정정 원장을 만든다.
  관리자는 모든 거래, 고용자는 본인 거래이며 확인 전일 때만 정정할 수 있다(위반 `403 FORBIDDEN`).
  정정도 즉시 반영하고 음수를 차단한다(DEC-085·DEC-086·DEC-088)
- `PATCH /products/{id}/minimum-stock`: 관리자만 최소 재고를 설정·해제한다. 미설정 제품은 부족 경고를
  표시하지 않는다(DEC-089·DEC-131)
- 검증: pytest 291건(Ruff·mypy 포함), 별도 일회용 PostgreSQL 18 DB에서 입고·출고·조정·정정·확인·
  음수 차단·제품 행 잠금·최소 재고 부족 표시·원장 필터·CHECK 제약·인덱스를 확인했다
- 생산·검사 기록만으로 완제품 재고를 자동 증가시키지 않는다(DEC-201). 실제 AI·자동 입고 연동은 후속이다

### 인수인계 현재 구현 범위 (2026-11-23)

관리자·고용자 모두 작성·조회하며 본문 수정은 작성자 본인만 가능하다(DEC-090·DEC-091·DEC-092·DEC-108·DEC-109·DEC-183·DEC-214).

- `GET /handover-notes`: `q`(본문 부분 일치), 담당 대상 필터 `department_id`·`production_line_id`·`equipment_id`(하나만), `include_all`, `page`/`page_size`(기본 10·최대 100). 관리자는 기본 전체, 고용자는 기본 본인 담당(`user_assignment`)과 연결된 노트만 조회하고 `include_all=true` 또는 대상 필터로 전체·다른 담당을 조회한다. 최신순 정렬이며 각 항목에 대상 목록, 확인자 수, 내 확인 시각을 포함한다
- `POST /handover-notes`: `body`와 선택 `targets`(부서·라인·설비 중 하나, 복수). `targets`를 생략하면 작성자 담당 범위를 기본 대상으로 사용한다. 존재하지 않거나 삭제된 대상, 중복 대상은 `422 VALIDATION_ERROR`다
- `GET /handover-notes/{id}`: 본문·담당 대상·수정 시각과 사용자별 확인자·확인 시각을 포함한다. 삭제된 노트는 `404 HANDOVER_NOT_FOUND`다
- `PATCH /handover-notes/{id}`: `version`과 `body`·`targets` 중 하나 이상. 작성자 본인만 가능하며 관리자도 타인 본문은 수정할 수 없다(`403 FORBIDDEN`). version이 다르면 `409 VERSION_CONFLICT`다. 수정해도 기존 확인 기록은 유지하고 재확인을 강제하지 않는다
- `DELETE /handover-notes/{id}?expected_version=`: soft delete. 관리자는 전체, 고용자는 본인 노트만 삭제한다(`403 FORBIDDEN`)
- `PUT /handover-notes/{id}/confirmation`: 로그인 사용자 본인의 확인자·확인 시각을 기록한다. 이미 확인한 경우 기존 기록을 그대로 반환해 중복 생성하지 않는다
- 검증: pytest 312건(Ruff·mypy 포함), 별도 일회용 PostgreSQL 18 DB에서 담당 기본 필터·대상 필터·검색·작성자 권한·version 충돌·soft delete 제외·멱등 확인·CHECK/UNIQUE 제약·인덱스를 확인했다
- 확인 알림, 복구, 노트 첨부는 추후 범위다

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
