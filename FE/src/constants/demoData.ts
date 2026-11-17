import type { CalendarEvent, Report } from '../types';
export const reports: Report[] = [
  {
    id: 'R-003',
    category: '설비 이상',
    title: '사출 3호기 유압 압력 변동 보고',
    description:
      '오후 검사 중 유압 압력 변동이 관찰되었습니다. 담당자 확인 후 점검 일정을 조율해 주세요. 예시 보고이며 실제 설비 상태가 아닙니다.',
    author: '이현우',
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
  { day: 12, time: '14:00', title: '3호기 금형 교체', kind: '점검' },
  { day: 17, time: '09:00', title: '생산팀 일일 회의', kind: '회의' },
  { day: 17, time: '14:00', title: '사출 3호기 정기 점검', kind: '점검' },
  { day: 17, time: '16:30', title: 'CN7 출하 전 품질 확인', kind: '납품' },
  { day: 19, time: '10:00', title: 'CN7 제품 납품', kind: '납품' },
  { day: 24, time: '14:00', title: '전 설비 안전 점검', kind: '점검' },
  { day: 26, time: '10:00', title: '월간 품질 회의', kind: '회의' },
];
export const equipment = [
  { name: '사출 1호기', product: 'CN7 LH', state: '정상', progress: 86 },
  { name: '사출 2호기', product: 'CN7 RH', state: '정상', progress: 92 },
  { name: '사출 3호기', product: 'RG3 LH', state: '주의', progress: 63 },
  { name: '사출 4호기', product: 'RG3 RH', state: '정상', progress: 81 },
];
