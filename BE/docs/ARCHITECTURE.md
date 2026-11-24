# 백엔드 구현 구조 초안

2026-11-19. 기존 AGENTS.md의 책임 분리·생성자 주입 원칙에 따른 기술 기본안이다. 아직 앱·의존성·실행 명령이 구현되지 않았다.

## 구성과 책임

구현 폴더 기본안은 BE/app/{routers,schemas,services,repositories,models,core,workers}다. 도메인별 파일을 가까이 두며 범용 Service·Repository 부모 클래스는 만들지 않는다.

| 구성 | 책임·의존 대상 |
| --- | --- |
| Router | 인증·입력 스키마·Service 호출·응답 변환. DB 쿼리·집계 업무를 작성하지 않음 |
| AuthService / AccountManagementService / WorkSessionService | 비밀번호 검증·토큰 교체·로그아웃, 관리자 계정 생성·임시 비밀번호 발급, 서버 시각 기반 종료·연장. 사용자·세션 Repository와 해시/토큰 도구 의존 |
| ProcessService / InspectionService | 조회·관리자 정정·감사 이력·버전 충돌. 기록 Repository 의존 |
| ProcessReplayService / Replay Worker | CSV 다음 레코드의 5초 간격 공개와 정상 종료. replay 행 잠금으로 동시 진행을 직렬화 |
| CurrentProcessService | 최신 replay의 공개 레코드를 설비별 최신 1건으로 조회하고 15초 지연 상태를 계산. ProcessReplayRepository 의존 |
| QualityService | 필터 범위 전체의 품질·가동률 집계. 공통 집계는 보고서도 사용 |
| ReportService | 중복 안내·권한·본문 버전·상태 변경·PDF 제공. 보고 Repository·작업 Repository·Renderer 의존 |
| GenerationWorker | DB 작업 선점·현재 권한 확인·고정 집계로 AI 호출·원자적 결과 등록. AI 클라이언트·Repository 의존 |
| ChatGenerationService / ChatToolExecutor | 질문·작업 상태·답변 저장 / AI 계획 검증과 화이트리스트 조회 도구 실행. 자유 SQL 없음 |
| StockService | 잔고 잠금·음수 방지·원장 정정·사후 확인. 재고 Repository 의존 |
| ScheduleService / HandoverService | 본인·관리자 업무 권한과 날짜 검증·확인 기록 |
| ChartRenderer / PdfRenderer | 저장 집계·본문으로 렌더링. DESIGN.md 기반 고정 스타일. 외부 이미지·임의 HTML 접근 금지 |

DB Session은 요청·작업 단위로 전달한다. Service가 트랜잭션 경계를 소유하며 Repository가 임의 commit하지 않는다. 순수 계산은 함수로 둔다. 외부 AI·렌더러 경계는 테스트 대역을 전달할 수 있게 설계하되 모든 클래스에 인터페이스를 만들지 않는다.

## 트랜잭션 경계

| 작업 | 함께 성공해야 하는 변경 |
| --- | --- |
| 보고 수정 | 버전 조건 갱신 + 새 revision, 상태 변경이면 status_event |
| 공정·검사 수정·삭제 | 버전 조건 갱신 + before/after 감사 기록 |
| 재고 거래·정정 | balance 행 잠금 + 권한·음수 검사 + 원장 추가 + 잔고 갱신 |
| 리프레시 교체 | 기존 credential 소비 + 새 credential 발급 정보. 재사용 시 해당 세션 폐기 |
| 자동 연장 | 현재 세션 종료 시각 비교 + 연장 이벤트 + 새 종료 시각 |
| 작업 접수 | 요청 키 중복 검사 + 기준 시각·대상 고정 + 일관된 집계 스냅샷 영속화 |
| 생성 완료 | 작업이 아직 실행 중인지 확인 + 보고/답변 등록 + succeeded 전환 |
| 기본 초기 적재 | 한 실행의 기본 데이터 전체. 실패 시 롤백 |
| 공정 재생 진행 | replay 행 잠금 + 다음 레코드 공개 시각 + cursor·상태·마지막 갱신 시각 변경 |

외부 AI 응답 대기 중에는 DB 트랜잭션을 열어 두지 않는다. PostgreSQL 작업 테이블과 별도 worker 프로세스를 기본안으로 사용해 요청 수명과 작업 수명을 분리한다. 별도 Redis·브로커를 미리 도입하지 않는다. 작업 선점은 행 잠금으로 중복 실행을 방지하고 시작·종료 상태를 영속화한다. worker 단일 실행부터 검증하며 heartbeat/lease와 재시작 중단 판별을 구현·테스트하기 전 다중 worker로 확장하지 않는다. 자동 재실행은 보류된 기존 정책을 유지한다.

## AI SQL 실행 경계

현재 AI 대화는 자유 SQL을 생성하지 않고 DEC-216·DEC-217의 허용 조회 도구만 호출한다. 아래 SQL 경계는 자유 SQL 기능을 도입할 때 적용하며, 실제 PostgreSQL에서 검증되기 전에는 자유 SQL 기능을 완료 처리하지 않는다.

1. 마이그레이션 소유자·일반 앱·AI 읽기 계정을 분리한다. AI 계정은 비소유자·비슈퍼유저·NOBYPASSRLS로 필요한 읽기 권한만 갖고 인증 테이블·credential·원본 대화·내부 오류에 접근하지 못한다.
2. AI에는 허용된 업무 스키마만 설명한다. 사용자 정보를 클라이언트나 모델 SQL에서 받아 권한으로 신뢰하지 않는다.
3. SQL 파서로 단일 SELECT와 읽기 CTE만 허용한다. 변경 CTE·다중 문장·SELECT INTO·행 잠금·임의 함수·시스템 카탈로그·설정 변경·다른 스키마를 거부한다. 문자열 접두사나 금칙어 정규식만으로 검증하지 않는다. 파서 패키지·허용 함수 목록은 설치 버전 확인 후 선정한다.
4. 읽기 전용 트랜잭션과 SQL 5초 제한을 적용한다. 함수 부작용·설정 변경을 읽기 전용만으로 막았다고 간주하지 않는다.
5. 보고서 RLS는 관리자 전체·고용자 본인, 일반 업무는 soft delete 제외를 강제한다. 공개 뷰는 안전한 컬럼만 노출한다. 뷰 소유자 권한으로 RLS가 우회되지 않게 실제 실행 계정으로 검사한다.
6. 사용자별 DB 컨텍스트는 서버가 트랜잭션 안에서 설정한다. 생성 SQL이 set_config·SET·권한 변경 등으로 컨텍스트를 위조할 수 없어야 한다. 연결 풀 재사용 시 권한이 섞이지 않게 트랜잭션 로컬 범위와 실패 후 초기화를 검증한다. 이 조건을 만족하지 못하면 사용자별 데이터 SQL 실행을 허용하지 않는다.
7. 동일 권한을 결과·근거 링크·과거 대화 검색·후속 AI 맥락에 다시 적용한다. 검색 결과 요약·total·스니펫에서도 가려진 답변 내용을 누출하지 않는다.

행 소유자·슈퍼유저가 RLS를 우회할 수 있다는 점은 [PostgreSQL RLS 문서](https://www.postgresql.org/docs/18/ddl-rowsecurity.html)를 따른다. 읽기 전용 제약의 범위는 [트랜잭션 문서](https://www.postgresql.org/docs/18/sql-set-transaction.html)를 참고했다. SQL 파서와 실제 권한 구성은 구현 시 검증할 필수 항목이다.

## 운영 전까지 남기는 사항

쿠키 SameSite·Domain·Path·CORS·구체적 CSRF는 실제 FE/BE 출처에 맞춰 적용한다. 비밀번호 해시·JWT 라이브러리는 초기 설치 검증에서 선정한다. 서버 시작은 필수 설정·마이그레이션 버전을 확인하고 AI 설정만 없으면 일반 기능을 제공한다. 배포·백업·전체 AI 제한 시간·시연 재시작은 기존 보류를 유지한다.
