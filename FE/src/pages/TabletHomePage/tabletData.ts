export const tabletEquipment = [
  {
    id: 'S14',
    product: 'RG3 RH',
    state: '주의',
    temperature: '265.1',
    pressure: '128',
    output: 386,
    target: 450,
    note: '압력 변동 확인 및 외관 검사 필요',
  },
  {
    id: 'S01',
    product: 'CN7 LH',
    state: '정상',
    temperature: '248.3',
    pressure: '120',
    output: 412,
    target: 450,
    note: '공정 조건이 관리 범위에 있습니다.',
  },
  {
    id: 'S08',
    product: 'SP2 RH',
    state: '미가동',
    temperature: '—',
    pressure: '—',
    output: 0,
    target: 360,
    note: '금형 교체 대기 중',
  },
  {
    id: 'S12',
    product: 'JX1 RH',
    state: '정상',
    temperature: '252.8',
    pressure: '123',
    output: 328,
    target: 400,
    note: '초도 검사 완료 · 정상 생산',
  },
];
export type TabletReport = {
  id: string;
  equipment: string;
  type: string;
  description: string;
  status: '접수 대기' | '확인 중' | '처리 완료';
  time: string;
};
export const initialTabletReports: TabletReport[] = [
  {
    id: 'TR-002',
    equipment: 'S14',
    type: '압력 이상',
    description: '압력 변동이 있어 외관 검사와 조건 확인을 요청합니다.',
    status: '확인 중',
    time: '10:20',
  },
  {
    id: 'TR-001',
    equipment: 'S01',
    type: '점검 요청',
    description: '노즐 점검 완료 후 초도 검사 결과를 확인했습니다.',
    status: '처리 완료',
    time: '09:10',
  },
];
