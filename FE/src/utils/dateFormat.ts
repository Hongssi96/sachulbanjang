export const formatDate = (value: string) =>
  /^\d{4}-\d{2}-\d{2}$/.test(value) ? value.replaceAll('-', '.') : '날짜 선택';
// 사용자의 로컬 날짜 기준(UTC 변환으로 하루가 밀리지 않게 한다).
export function todayISO(now: Date = new Date()) {
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}
export function shiftDateISO(value: string, days: number) {
  const date = new Date(`${value}T00:00:00`);
  date.setDate(date.getDate() + days);
  return todayISO(date);
}
/** 서버 보고 기간 필터와 같은 한국(Asia/Seoul) 기준 오늘 날짜. */
export function todaySeoulISO(now: Date = new Date()) {
  return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Seoul' }).format(now);
}
export function formatDateTime(value: string) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return '—';
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);
  const part = (type: string) => parts.find((item) => item.type === type)?.value ?? '';
  return `${part('year')}.${part('month')}.${part('day')} ${part('hour')}:${part('minute')}`;
}
