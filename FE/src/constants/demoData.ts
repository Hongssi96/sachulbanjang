// 데모 데이터 소스: BE 연동 전까지 앱 전체가 사용하는 유일한 데이터 공급 모듈.
// 모든 export는 types/index.ts의 계약(인터페이스)을 따르며, api/ 구현 시 동일한 타입으로 교체한다.
import type { CalendarEvent, Equipment, ProductQuality, RealtimeEvent, Report } from '../types';
export const reports: Report[] = [
  {
    id: 'R-003',
    category: '설비 이상',
    title: '사출 3호기 유압 압력 변동 보고',
    description:
      '오후 검사 중 유압 압력 변동이 관찰되었습니다. 담당자 확인 후 점검 일정을 조율해 주세요. 예시 보고이며 실제 설비 상태가 아닙니다.',
    author: '홍태휘',
    time: '14:32',
    status: '대기',
    equipment: '사출 3호기',
  },
  {
    id: 'R-002',
    category: '품질 보고',
    title: 'RG3 RH 외관 검사 결과 공유',
    description:
      '외관 검사에서 찍힘이 관찰되어 검사 기록과 공정 조건의 비교를 요청했습니다. 원인은 확정되지 않았습니다. 예시 보고입니다.',
    author: '김가을',
    time: '13:45',
    status: '진행 중',
    equipment: '사출 4호기',
  },
  {
    id: 'R-001',
    category: '점검 완료',
    title: '사출 2호기 정기 점검 완료',
    description:
      '정기 점검 체크리스트 확인과 소모품 교체를 마쳤습니다. 다음 교대 근무자가 점검 기록을 확인할 수 있도록 인수인계합니다. 예시 보고입니다.',
    author: '황지혜',
    time: '11:20',
    status: '완료',
    equipment: '사출 2호기',
  },
];
export const calendarEvents: CalendarEvent[] = [
  {
    day: 12,
    time: '14:00',
    title: '3호기 금형 교체',
    kind: '점검',
    description: '사출 3호기 금형을 교체하고 첫 사이클 품질을 확인합니다. 예시 일정입니다.',
  },
  {
    day: 17,
    time: '09:00',
    title: '생산팀 일일 회의',
    kind: '회의',
    description: '전일 생산 실적과 금일 생산 계획을 공유합니다. 예시 일정입니다.',
  },
  {
    day: 17,
    time: '14:00',
    title: '사출 3호기 정기 점검',
    kind: '점검',
    description: '유압 압력 변동 보고(R-003) 이후 첫 정기 점검이에요. 예시 일정입니다.',
  },
  {
    day: 17,
    time: '16:30',
    title: 'CN7 출하 전 품질 확인',
    kind: '납품',
    description: '출하 전 외관·치수 검사를 실시합니다. 예시 일정입니다.',
  },
  {
    day: 19,
    time: '10:00',
    title: 'CN7 제품 납품',
    kind: '납품',
    description: '완제품 물류 이동과 인수 확인을 진행합니다. 예시 일정입니다.',
  },
  {
    day: 24,
    time: '14:00',
    title: '전 설비 안전 점검',
    kind: '점검',
    description: '10대 설비의 안전 커버와 비상 정지 스위치를 확인합니다. 예시 일정입니다.',
  },
  {
    day: 26,
    time: '10:00',
    title: '월간 품질 회의',
    kind: '회의',
    description: 'RG3 RH 불량 집중 기간(10/22–23)의 분석 결과를 공유합니다. 예시 일정입니다.',
  },
  {
    month: 11,
    day: 2,
    time: '10:00',
    title: '금형 유지보수',
    kind: '점검',
    description: '12월 가동 전 금형 세척과 윤활을 진행합니다. 예시 일정입니다.',
  },
  {
    month: 11,
    day: 11,
    time: '14:00',
    title: '분기 결산 미팅',
    kind: '회의',
    description: '4분기 생산·품질 지표를 정리합니다. 예시 일정입니다.',
  },
];
// 전체 생산량 수치는 홈 KPI·생산 현황 카드의 고정 예시와 동일하게 유지한다
export const productionSummary = {
  today: 5232, // 홈 KPI '전체 생산량'과 동일
  week: 42810, // 홈 생산현황 '최근 9일'과 동일
  todayTarget: 5400, // 홈 KPI '목표 생산량'과 동일
  previousToday: 5030, // 목업 '작월' 비교 값
  previousWeek: 40086, // 이전 9일 비교 값(최근 9일 대비 +6.8% 기준 역산)
};
export const equipment: Equipment[] = [
  {
    name: '사출 1호기',
    product: 'CN7 LH',
    state: '정상',
    progress: 86,
    production: 780,
    target: 900,
    cycleMinutes: 45,
    lastCheck: '2026.11.16',
  },
  {
    name: '사출 2호기',
    product: 'CN7 RH',
    state: '정상',
    progress: 92,
    production: 720,
    target: 900,
    cycleMinutes: 45,
    lastCheck: '2026.11.16',
  },
  {
    name: '사출 3호기',
    product: 'RG3 LH',
    state: '주의',
    progress: 63,
    production: 460,
    target: 780,
    cycleMinutes: 58,
    lastCheck: '2026.11.15',
  },
  {
    name: '사출 4호기',
    product: 'RG3 RH',
    state: '정상',
    progress: 81,
    production: 850,
    target: 1040,
    cycleMinutes: 42,
    lastCheck: '2026.11.14',
  },
  {
    name: '사출 5호기',
    product: 'CN7 LH',
    state: '정상',
    progress: 88,
    production: 980,
    target: 1160,
    cycleMinutes: 40,
    lastCheck: '2026.11.16',
  },
  {
    name: '사출 6호기',
    product: 'CN7 RH',
    state: '정상',
    progress: 74,
    production: 710,
    target: 900,
    cycleMinutes: 44,
    lastCheck: '2026.11.16',
  },
  {
    name: '사출 7호기',
    product: 'RG3 LH',
    state: '휴식',
    progress: 0,
    production: 220,
    target: 780,
    lastCheck: '2026.11.10',
  },
  {
    name: '사출 8호기',
    product: 'RG3 RH',
    state: '휴식',
    progress: 0,
    production: 180,
    target: 780,
    lastCheck: '2026.11.08',
  },
  {
    name: '사출 9호기',
    product: 'CN7 LH',
    state: '고장',
    progress: 0,
    production: 60,
    target: 650,
    lastCheck: '2026.11.17',
  },
  {
    name: '사출 10호기',
    product: 'RG3 LH',
    state: '고장',
    progress: 0,
    production: 272,
    target: 650,
    lastCheck: '2026.11.17',
  },
];
export const realtimeEvents: RealtimeEvent[] = [
  {
    time: '16:38',
    machine: '사출 6호기',
    level: '정상',
    message: '사이클 타임이 정상 범위로 복귀했어요 (44분)',
  },
  {
    time: '16:20',
    machine: '사출 3호기',
    level: '주의',
    message: '유압 압력 변동이 지속되고 있어요 — 점검 대기 중',
  },
  {
    time: '15:52',
    machine: '사출 9호기',
    level: '고장',
    message: '금형 잠금 이상이 감지되어 비가동으로 전환됐어요',
  },
  {
    time: '15:30',
    machine: '사출 7호기',
    level: '정보',
    message: '금형 교체 대기로 휴식 상태가 되었어요',
  },
  {
    time: '14:58',
    machine: '사출 5호기',
    level: '정상',
    message: '교대 후 첫 사이클을 시작했어요',
  },
  {
    time: '14:32',
    machine: '사출 3호기',
    level: '정보',
    message: '현장 보고 접수: 유압 압력 변동 (R-003)',
  },
];
export const qualityPeriod = '2026.10.16 – 2026.11.06';
export const productQuality: ProductQuality[] = [
  { product: 'CN7 LH', inspections: 1985, defects: 10 },
  { product: 'CN7 RH', inspections: 1989, defects: 18 },
  { product: 'RG3 LH', inspections: 628, defects: 5 },
  { product: 'RG3 RH', inspections: 628, defects: 27, focus: true },
];
export const defectRatePrevious = 1.47;
