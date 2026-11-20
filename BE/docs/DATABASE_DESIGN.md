# DB 설계 초안

기준일: 2026-11-20. [요구사항](REQUIREMENTS.md)의 사용자 결정을 반영한 설계다. 계정·조직·설비·품목과 CSV 공정 재생의 핵심 테이블은 Alembic `20261120_0003`까지 구현했으며 [ERD](ERD.md)에 실제 구조를 표시한다. 그 밖의 아래 테이블·필드·인덱스는 기술 기본안이며 마이그레이션 적용 완료를 의미하지 않는다.

## 공통 규칙

- PostgreSQL 18, 단수 snake_case, 자동 증가 bigint PK. 사번 등 업무 식별자와 내부 PK를 분리한다.
- 시각은 timestamptz, API는 UTC RFC 3339, 화면은 한국 시간이다. 날짜만 의미하는 값은 date로 보관한다.
- 업무 리소스는 created_at·updated_at, 삭제 가능한 리소스는 deleted_at을 갖는다. 실제 삭제와 FK CASCADE로 이력을 제거하지 않는다. 참조 관계는 기본 RESTRICT다.
- 변경 이력·재고 원장·다운로드 이벤트는 추가 기록 방식으로 보존한다. 일반 CRUD 삭제 대상이 아니며 soft delete를 이유로 현재고 계산에서 거래를 제외하지 않는다.
- 동시 수정 대상은 version 양의 정수를 두고 `id + version + deleted_at IS NULL` 조건으로 원자적 갱신한다. 0건이면 삭제·권한·충돌을 서버에서 구분한다.
- 표에서 `?`는 nullable이다. 생략 필드의 PATCH 의미와 null 허용은 API_SPEC을 따른다. 각 테이블의 전체 DDL·길이 제한은 초기 구현에서 확정한다.

## 계정·조직·근무

| 테이블 | 주요 필드와 제약 |
| --- | --- |
| app_user | employee_no UNIQUE(삭제 계정 포함), display_name, password_hash, role(admin/worker), must_change_password, shift_start_local, shift_end_local, failed_login_count, locked_until?, deleted_at |
| department | code UNIQUE 범위 검증 필요, name, deleted_at |
| production_line | department_id FK, code, name, deleted_at. 부서 내 코드 UNIQUE는 데이터 확인 후 결정 |
| equipment | production_line_id? FK, equipment_code UNIQUE, name, deleted_at. CSV에 라인 값이 없어 현재 소속은 비울 수 있음 |
| product | product_code? UNIQUE, name, minimum_stock? >= 0, deleted_at. PART_NO가 없는 CSV 품목도 허용 |
| user_assignment | user_id FK, department_id?·production_line_id?·equipment_id? FK. 세 대상 중 정확히 하나만 NOT NULL. 대상별 활성 배정 중복 방지 |
| auth_session | user_id FK, absolute_expires_at, revoked_at?, current_refresh_generation. 최초 로그인 기준 7일 상한 |
| refresh_credential | session_id FK, token_digest UNIQUE, generation, expires_at, consumed_at?, revoked_at?. 재사용 감지를 위해 사용된 토큰의 식별 정보를 보존하고 토큰 원문은 저장하지 않음 |
| session_work_period | session_id UNIQUE FK, ends_at, version. 같은 세션의 탭들이 공유하는 현재 이용 종료 시각 |
| work_extension | session_id FK, previous_ends_at, new_ends_at, kind(manual/automatic), actor_id FK. 자동 연장은 (session_id, previous_ends_at)에 부분 UNIQUE |

계정별 기본 근무시간과 로그인 세션의 실제 종료 시각을 구분한다. 자동 연장은 현재 종료 시각의 10분 전 구간에서 실제 입력·클릭 신호를 받은 경우만 처리한다. 클라이언트 활동 신호는 업무 편의를 위한 신호이며 서버에서 구간·세션·중복을 검사한다. 연장해도 JWT 만료나 최초 로그인 기준 상한은 변경하지 않는다.

## 공정·검사·품질

| 테이블 | 주요 필드와 제약 |
| --- | --- |
| source_import | source_name, source_fingerprint UNIQUE, status, started_at, finished_at?, error_code?. 파일 해시만으로 행의 업무 식별자를 대체하지 않음 |
| process_record | source_import_id FK, source_row_number, equipment_id FK, product_id? FK, occurred_at, available_at?, cycle_time_seconds?, source_namespace, source_record_key, source_payload, is_demo, version, deleted_at. (source_import_id, source_row_number), (source_namespace, source_record_key) UNIQUE |
| inspection_record | equipment_id FK, product_id? FK, process_record_id? FK, inspected_at, available_at, verdict, defect_type?, reason?, is_demo, version, deleted_at |
| operation_day | equipment_id FK, local_date, planned_seconds >= 0, actual_seconds >= 0, is_demo. (equipment_id, local_date) UNIQUE |
| record_change | process_record_id? FK, inspection_record_id? FK, actor_id FK, operation, before_value, after_value, reason, version, occurred_at. 공정·검사 FK 중 정확히 하나 |
| process_replay | source_import_id FK, cursor, data_time?, last_advanced_at?, state. 재시작 절차는 Q-167 보류 |

확인한 세 CSV 모두 `_id`를 제공하며 elice_v1과 labeled 데이터에 같은 키가 재등장한다. 원본 파일과 1부터 시작하는 행 번호로 파일 내 위치를 식별하고, source namespace와 `_id` 조합의 UNIQUE로 교차 파일 중복 적재를 막는다. 같은 키·같은 원본 내용은 건너뛰고 내용이 다르면 충돌로 전체 적재를 롤백한다. 같은 파일 fingerprint의 재적재도 거부하고 원본 행 전체를 source_payload에 보존한다. 자동 검사 결과의 수동 등록 API는 만들지 않는다. 공정·검사 수정·삭제는 관리자 전용이며 record_change와 같은 트랜잭션에서 저장한다.

확인한 공정 CSV에는 EQUIP_CD·EQUIP_NAME·PART_NO(일부 파일)·PART_NAME·TimeStamp·Cycle_Time이 있다. 설비 코드는 실제 값(S01, S02, S04, S06~S15)을 사용하고 프론트 목업의 사출 1~10호기를 마스터 근거로 사용하지 않는다. 같은 품목이 여러 설비에서 생산되므로 설비와 품목을 고정 1:1로 연결하지 않는다. Cycle_Time은 초 단위 `cycle_time_seconds`로 저장한다. CSV에 없는 라인·설비 상태·목표 생산량·실제 생산 수량은 추론하지 않는다.

검사 데이터에 공정과 연결할 키가 없으면 process_record_id는 비워 두며 시간·설비가 비슷하다는 이유로 억지 연결하지 않는다. verdict는 시연 데이터에 양품/불량을 명시한다. 불량 유형 누락은 표시·집계에서 ‘미분류’로 처리한다. 실제 수집 필드·판정 매핑은 미확정이다.

불량률은 불량/(양품+불량)이다. 가동률은 기간별 실제 시간 합계/계획 시간 합계이며 일별 비율의 평균을 사용하지 않는다. 분모 0은 null과 표시용 ‘—’로 구분한다. 가동률 시연의 기본 조회 단위는 설비·날짜이며 품목별 실제 가동률로 확장하지 않는다. 임의 기간의 시연 시간 배분과 화면 필터는 데이터 준비 때 확인한다. CSV 행 수는 생산 기록 건수이며 생산 개수로 바꾸지 않는다.

## 보고서·생성 작업

| 테이블 | 주요 필드와 제약 |
| --- | --- |
| generation_job | requester_id FK, kind(report/chat), client_request_key, request_payload, request_digest, input_snapshot?, resolved_scope_snapshot?, retry_of_id? FK, accepted_at, data_cutoff_at, state, error_code?, safe_error_message?, claimed_at?, finished_at?. (requester_id, kind, client_request_key) UNIQUE |
| report | author_id FK, generation_job_id UNIQUE FK, title, body_markdown, category, report_kind, business_status, period_start, period_end_exclusive, data_cutoff_at, aggregate_snapshot, resolved_scope_snapshot, chart_style_version, version, last_editor_id FK, deleted_at |
| report_target | report_id FK, department_id?·production_line_id?·equipment_id? FK. 정확히 하나의 대상. 원래 선택과 고정된 설비 목록을 구분 |
| report_revision | report_id FK, version, title, body_markdown, editor_id FK, created_at. (report_id, version) UNIQUE. 최초 버전도 보존 |
| report_status_event | report_id FK, before_status, after_status, actor_id FK, created_at |
| report_download | report_id FK, report_revision_id FK, user_id FK, provided_at. 요청당 이벤트를 기록하고 횟수는 이벤트 수로 계산 |

집계 스냅샷은 수치·단위·시연 여부·누락 사유·계산 규칙 버전을 담는 JSONB 구조로 고정한다. 코드의 스키마 검증을 거쳐 저장하며 일반 테이블의 관계·검색 필드를 무차별 JSON으로 대체하지 않는다.

접수 때 데이터 기준 시각과 대상 설비를 고정하고 같은 DB 스냅샷에서 조회·집계한 결과를 영속화한 뒤 AI에 전달한다. 접수 이후 수정·삭제·추가된 데이터로 과거 접수 결과가 바뀌지 않게 한다. 집계 입력 확보가 오래 걸리는 경우의 접수 응답 시간은 실제 CSV로 검증한다. AI 호출 동안 DB 트랜잭션·행 잠금을 유지하지 않는다.
보고서 작업의 input_snapshot은 접수 트랜잭션에서 채운다. 성공 시 report.aggregate_snapshot에 동일한 결과를 연결·보존한다. 채팅의 자연어 SQL 입력 결과는 조회 단계에서 확보하며 보고서의 접수 시 집계 보장과 혼동하지 않는다. 작업별로 기준 시각을 표시한다.

보고서 생성 종류·기간·대상 중복은 안내 대상이며 UNIQUE로 생성 자체를 금지하지 않는다. 사용자의 명시적 재생성은 새 요청이다. 동일 요청 키에 다른 요청 본문을 재사용하면 충돌로 거부한다.

## 대화·일정·인수인계

| 테이블 | 주요 필드와 제약 |
| --- | --- |
| conversation | owner_id FK, title, deleted_at |
| chat_turn | conversation_id FK, question, answer?, active_job_id? FK, answered_at?, query_scope?, data_cutoff_at?, is_demo?. 실패 재시도는 동일 질문에 새 작업 연결 |
| answer_evidence | chat_turn_id FK, report_id?·process_record_id?·inspection_record_id?·product_id? FK, source_version?, source_time. 최소 하나의 근거, 종류 확장 시 명시적 FK 추가 |
| schedule | author_id FK, title, category, description?, all_day, start_date?, end_date_exclusive?, starts_at?, ends_at?, version, deleted_at |
| handover_note | author_id FK, body, version, deleted_at. 대상은 별도 handover_target에서 관리 |
| handover_target | handover_note_id FK, department_id?·production_line_id?·equipment_id? FK. 정확히 하나 |
| handover_read | handover_note_id FK, user_id FK, confirmed_at. (handover_note_id, user_id) UNIQUE |

답변 전체의 근거를 식별해 현재 권한을 검사하며 검증할 수 없는 근거를 가진 과거 답변을 그대로 외부 AI에 전달하지 않는다. 집계 답변도 조회 범위·소스 종류·작성 당시 권한 범위를 별도로 보존한다. 삭제된 근거와 권한 상실은 구분한다. 근거가 없는 일반 설명에는 업무 자료 근거를 조작해 넣지 않는다.

종일 일정은 date 쌍, 시간 지정 일정은 timestamptz 쌍으로 서로 배타적으로 저장한다. 종료 경계는 내부·API에서 exclusive라는 기술 기본안을 사용해 화면의 마지막 날짜와 변환한다. 종료 > 시작을 CHECK로 보장한다. 일정·노트의 version은 일관된 충돌 처리를 위한 기술 기본안이다.

## 재고

| 테이블 | 주요 필드와 제약 |
| --- | --- |
| stock_balance | product_id UNIQUE FK, quantity bigint CHECK(quantity >= 0) |
| stock_movement | product_id FK, actor_id FK, kind(initial/receipt/issue/adjustment/correction), delta bigint, reason?, original_movement_id? FK, checked_by_id? FK, checked_at?, created_at |

재고 원장을 수정·삭제해서 거래를 없애지 않는다. 정정은 원본에 연결된 signed delta의 새 행이다. 동일 품목의 balance 행을 잠그고 권한·확인 여부·음수 여부를 검증한 뒤 원장 추가와 잔고 갱신을 함께 커밋한다. 관리자 확인과 고용자 정정의 경합도 같은 원본 행 잠금 안에서 검사한다. 반대 순서로 잠가 교착하지 않도록 품목→원본 기록 순서를 통일한다. 생산 기록은 자동 입고를 만들지 않는다(DEC-201).

## 조회·인덱스·무결성 검증

- 기본 후보: 보고서 (author_id, created_at, id), 공정 (equipment_id, occurred_at, id), 검사 (equipment_id, inspected_at, id), 대화 (owner_id, updated_at, id), 일정 (starts_at, id)·(start_date, id), 재고 원장 (product_id, created_at, id), 작업 (requester_id, state, created_at).
- 활성 목록에는 필요한 경우 deleted_at IS NULL 부분 인덱스를 사용한다. 과거 업무 조회에서 참조 설비·작성자가 삭제됐다는 이유로 자식 기록까지 제외하지 않는다.
- 부분 문자열 검색이 커졌을 때 실제 실행 계획을 보고 인덱스를 추가한다. 현 단계에서 검색 엔진·벡터 DB를 추가하지 않는다.
- CHECK·FK·UNIQUE, 낙관적 버전 충돌, 동시 출고 음수 방지, 세션 자동 연장 중복, soft delete 후 이력 보존을 PostgreSQL 통합 테스트로 확인한다.

## 관계 개요

department → production_line → equipment (현재 소속 가정)

app_user → user_assignment → department / production_line / equipment

equipment → process_record / inspection_record / operation_day

app_user → generation_job → report → report_revision / report_status_event / report_download

app_user → conversation → chat_turn → answer_evidence

product → stock_balance / stock_movement → original stock_movement

관계 개요는 전체 논리 모델이며 전체 FK는 위 표를 따른다. 현재 구현된 DDL은 [ERD.md](ERD.md)를 기준으로 확인한다.

## 보류와 검증 근거

CSV TimeStamp의 원본 시간대, 실제 검사 연결, 운영 조직·라인 데이터는 아직 확정하지 않는다. 품목 코드는 존재할 때 유일하게 관리하되 코드가 없는 품목의 동일성 판정은 적재 구현에서 추가 검증한다. AI 모델·승인된 전송 필드, 배포 출처·운영 백업도 기존 보류다.

동시성 설계는 PostgreSQL의 [명시적 잠금](https://www.postgresql.org/docs/18/explicit-locking.html)을 참고했다. 실제 적용·성능·교착 검증은 미실행이다.
