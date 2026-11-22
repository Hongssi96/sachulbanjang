import { useSyncExternalStore } from 'react';
import { calendarEvents } from '../constants/demoData';
import type { CalendarEvent } from '../types';

// 일정 탭에서 추가·수정·삭제한 일정을 이 브라우저 세션 동안 보관하고 홈 카드와 공유한다.
const STORAGE_KEY = 'imleader.calendar-events-v2';
const listeners = new Set<() => void>();

interface CalendarState {
  custom: CalendarEvent[];
  removed: string[];
}

function isCalendarEvent(value: unknown): value is CalendarEvent {
  return (
    typeof value === 'object' &&
    value !== null &&
    'id' in value &&
    typeof value.id === 'string' &&
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
function load(): CalendarState {
  try {
    const parsed: unknown = JSON.parse(sessionStorage.getItem(STORAGE_KEY) ?? 'null');
    if (typeof parsed !== 'object' || parsed === null) return { custom: [], removed: [] };
    const custom =
      'custom' in parsed && Array.isArray(parsed.custom)
        ? parsed.custom.filter(isCalendarEvent)
        : [];
    const removed =
      'removed' in parsed && Array.isArray(parsed.removed)
        ? parsed.removed.filter((id): id is string => typeof id === 'string')
        : [];
    return { custom, removed };
  } catch {
    return { custom: [], removed: [] };
  }
}
// 데모 일정 위에 사용자가 추가·수정한 일정을 덮어쓰고, 삭제한 일정은 제외한다.
function buildMerged(next: CalendarState): CalendarEvent[] {
  const map = new Map<string, CalendarEvent>();
  calendarEvents.forEach((event) => map.set(event.id, event));
  next.custom.forEach((event) => map.set(event.id, event));
  next.removed.forEach((id) => map.delete(id));
  return [...map.values()];
}

let state: CalendarState = load();
let merged: CalendarEvent[] = buildMerged(state);

function persist() {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(state));
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
function commit(next: CalendarState) {
  state = next;
  merged = buildMerged(next);
  persist();
  listeners.forEach((listener) => listener());
}
export function addCalendarEvent(input: Omit<CalendarEvent, 'id'>): CalendarEvent {
  const event: CalendarEvent = {
    ...input,
    id: `user-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
  };
  commit({ ...state, custom: [...state.custom, event] });
  return event;
}
export function updateCalendarEvent(event: CalendarEvent) {
  commit({
    ...state,
    custom: [...state.custom.filter((item) => item.id !== event.id), event],
    removed: state.removed.filter((id) => id !== event.id),
  });
}
export function removeCalendarEvent(id: string) {
  const isDemo = calendarEvents.some((event) => event.id === id);
  commit({
    custom: state.custom.filter((event) => event.id !== id),
    removed: isDemo ? [...new Set([...state.removed, id])] : state.removed,
  });
}
export function useCalendarEvents(): CalendarEvent[] {
  return useSyncExternalStore(subscribe, () => merged);
}
