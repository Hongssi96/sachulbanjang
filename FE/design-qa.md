# 태블릿 로딩 시각 검증

final result: blocked

- 기준 이미지: `/Users/kyle/Desktop/iamleader/image.png` (1200 × 900). 직접 열어 확인했다.
- 구현: `src/components/TabletLoading/TabletLoading.tsx` 및 연결된 태블릿 진입점.
- 구현한 구성: 중앙 진행 막대, 막대 위 퍼센트, 아래 `화면을 준비중`.
- 후속 사용자 요청으로 참고 이미지의 회색 배경과 흰 카드를 제거했다. 진행 막대와 퍼센트는
  서비스의 `--primary`, 트랙은 `--border`, 안내는 `--muted` 색상을 사용한다.
- 브라우저 캡처와 같은 뷰포트에서의 이미지 비교는 실행하지 않았다. 사용자의 컴퓨터 유즈 금지
  지시를 유지했다. 따라서 정렬·간격·폰트의 실제 렌더링 일치 여부는 미확인이다.
- 적용한 Product Design QA 지침:
  `/Users/kyle/.codex/plugins/cache/openai-curated-remote/product-design/0.1.56/skills/design-qa/SKILL.md`:
  “If browser-rendered evidence is missing, `final result` is `blocked`.”
- 비시각 검증: ESLint, Prettier, 데스크톱·태블릿 타입 검사 및 빌드 통과.
- jsdom 검증: 빠른 응답의 최소 1초 대기, 느린 필수 데이터 대기, 오류 시 로딩 종료, 인증 전
  업무 API 미호출, 인증 실패 후 로그인 이동, 헤더를 유지한 메뉴 이동, 검색 조건 변경 시 공통
  로딩 미재시작, 보고 상세 스켈레톤, 잘못된 주소, 비밀번호 변경 분기, 데스크톱 기본 로딩 유지.
- jsdom은 시각 렌더링 엔진이 아니므로 위 결과를 시각 검증 통과로 보지 않는다.
- 진행 퍼센트는 API의 실제 진행률이 아니다. 대기 중 최대 95%까지 표시하며 기존 `PageEntry`의
  최소 시간·데이터 완료 조건이 충족되면 100%를 0.2초 표시한 뒤 닫는다. 이 마무리 시간은
  태블릿에만 적용하고 데스크톱은 기존 종료 타이밍을 유지한다.
- 스크롤 보정: 전체 화면 로딩은 `100dvh`의 고정 영역으로 표시한다. 본문 로딩은 고정 최소
  높이를 적용하는 대신 헤더·페이지 여백을 제외한 flex 잔여 공간을 사용한다. 1150px/850px
  분기에서 기존 페이지 여백을 반영한다. 실제 브라우저의 스크롤 높이는 미확인이다.
