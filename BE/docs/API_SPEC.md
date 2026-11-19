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

## 개별 API 기술 기본안

아래 경로·필드명은 BE 설계 후보이며 FE가 개별 계약을 승인했거나 구현됐다는 뜻은 아니다. 공통 계약 DEC-152는 유지한다. 경로의 복수형은 HTTP 리소스 명명이며 DB의 단수 테이블 규칙과 구분한다. base는 /api/v1이다.

| 메서드·경로 | 입력·동작 | 권한·핵심 응답 |
| --- | --- | --- |
| POST /auth/login | employee_no, password | 쿠키 설정, 사용자·근무 종료 시각. 토큰 원문 JSON 반환 없음 |
| POST /auth/refresh, POST /auth/logout | 인증 쿠키·CSRF 계약 | 회전·현재 세션 종료 |
| GET /auth/me | 현재 사용자 | 역할·담당·비밀번호 변경 필요 여부 |
| PATCH /auth/password | current_password, new_password | 본인. 임시 비밀번호 변경 제한 처리 |
| POST /users/{id}/password-reset | 임시 비밀번호 생성/전달 규격은 실제 계약 확인 | 관리자. 원문 로그 금지 |
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

신규 사용자 생성·마스터 편집·검사 수동 등록·재고 원장 삭제·예약 보고·복구 API는 추가하지 않는다. 실제 검사 수집 API는 원천·인증 규격 확보 후 별도 설계한다.

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

## 구현 시 상세 확인

필수값은 FE가 전송 전에 검사해 사용자에게 안내하고 BE도 요청에서 검증한다. 부분 수정에서 생략은 기존 값 유지, nullable 필드의 null은 값 제거, 필수값의 null은 검증 오류로 처리한다. 필드별 생략·null 허용 여부를 명세한다(DEC-155).

- 필수·선택·null 의미와 요청·응답 필드별 런타임 검증
- 페이지 메타데이터, 검색·필터·정렬 파라미터 이름과 기본값
- 작업 상태 코드, 요청 재전송 식별자, 버전 충돌 응답
- CSRF 전송·검증 방식과 FE·BE 배포 출처별 쿠키·CORS 설정
- 공정 CSV의 시간대·필드와 내부 데이터 모델의 매핑
- DEC-153의 문서화 방식에 따른 실제 OpenAPI 화면 구현과 계약·구현 일치 검증

전체 업무 규칙은 [REQUIREMENTS.md](REQUIREMENTS.md), 합의 과정은 [DECISION_HISTORY.md](DECISION_HISTORY.md)를 참조한다.
