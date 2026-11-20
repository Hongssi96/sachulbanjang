import { useSyncExternalStore } from 'react';
import type { CalendarEvent } from '../types';

// 일정 탭에서 추가한 일정을 이 브라우저 세션 동안 보관하고 홈 카드와 공유한다.
const STORAGE_KEY = 'imleader.calendar-events';
const listeners = new Set<() => void>();
let customEvents: CalendarEvent[] = load();

function isCalendarEvent(value: unknown): value is CalendarEvent {
  return (
    typeof value === 'object' &&
    value !== null &&
    'day' in value &&
    typeof value.day === 'number' &&
    'time' in value &&
    typeof value.time === 'string' &&
    'title' in value &&
    typeof value.title === 'string' &&
    'kind' in value &&
    (value.kind === '점검' || value.kind === '납품' || value.kind === '회의')
  );
}
function load(): CalendarEvent[] {
  try {
    const parsed: unknown = JSON.parse(sessionStorage.getItem(STORAGE_KEY) ?? '[]');
    return Array.isArray(parsed) ? parsed.filter(isCalendarEvent) : [];
  } catch {
    return [];
  }
}
function persist() {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(customEvents));
  } catch {
    // 저장소를 쓸 수 없는 환경에서는 메모리 상태만 유지한다.
  }
}
function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
function emit() {
  listeners.forEach((listener) => listener());
}
export function addCalendarEvent(event: CalendarEvent) {
  customEvents = [...customEvents, event];
  persist();
  emit();
}
export function useCustomCalendarEvents(): CalendarEvent[] {
  return useSyncExternalStore(subscribe, () => customEvents);
}
