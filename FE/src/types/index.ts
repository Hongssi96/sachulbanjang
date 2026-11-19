export type ReportStatus = '대기' | '진행 중' | '완료';
export interface Report {
  id: string;
  category: string;
  title: string;
  description: string;
  author: string;
  time: string;
  status: ReportStatus;
  equipment: string;
}
export interface ReportPost extends Report {
  date: string;
  views: number;
  body: string;
  nextAction: string;
}
export interface HandoverNote {
  id: string;
  content: string;
  author: string;
  checked: boolean;
}
export interface CalendarEvent {
  day: number;
  time: string;
  title: string;
  kind: '점검' | '납품' | '회의';
  description?: string;
  month?: number; // 0 기준 월(11월 = 10). 미지정이면 11월로 취급한다
}
export type EquipmentState = '정상' | '주의' | '고장' | '휴식';
export interface Equipment {
  name: string;
  product: string;
  state: EquipmentState;
  progress: number;
  production?: number;
  target?: number;
  cycleMinutes?: number;
  lastCheck?: string;
}
export interface RealtimeEvent {
  time: string;
  machine: string;
  level: '정상' | '주의' | '고장' | '정보';
  message: string;
}
export interface ProductQuality {
  product: string;
  inspections: number;
  defects: number;
  focus?: boolean;
}
