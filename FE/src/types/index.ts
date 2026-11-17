export interface Report {
  id: string;
  category: string;
  title: string;
  description: string;
  author: string;
  time: string;
  status: '대기' | '진행 중' | '완료';
  equipment: string;
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
}
