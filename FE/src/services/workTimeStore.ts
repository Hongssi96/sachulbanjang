import { useSyncExternalStore } from 'react';

export interface WorkTime {
  start: string;
  end: string;
}

export const DEFAULT_WORK_TIME: WorkTime = { start: '08', end: '17' };

const STORAGE_KEY = 'imleader.my-work-time-v1';
const listeners = new Set<() => void>();

function load(): WorkTime {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null');
    if (
      typeof parsed === 'object' &&
      parsed !== null &&
      'start' in parsed &&
      typeof parsed.start === 'string' &&
      'end' in parsed &&
      typeof parsed.end === 'string'
    ) {
      return { start: parsed.start, end: parsed.end };
    }
  } catch {
    /* 저장소를 쓸 수 없으면 기본 근무 시간을 쓴다. */
  }
  return DEFAULT_WORK_TIME;
}

let workTime: WorkTime = load();

function persist() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(workTime));
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

export function getWorkTime(): WorkTime {
  return workTime;
}
export function setWorkTime(next: WorkTime) {
  workTime = next;
  persist();
  listeners.forEach((listener) => listener());
}
export function useWorkTime(): WorkTime {
  return useSyncExternalStore(subscribe, () => workTime);
}

/** 근무 종료 시각을 자정 기준 분으로 바꾼다. HH 또는 HH:MM 모두 처리한다. */
export function workEndMinutes(time: WorkTime): number {
  const [hour, minute = '0'] = time.end.split(':');
  return (Number(hour) || 0) * 60 + (Number(minute) || 0);
}

export const formatWorkTime = (time: WorkTime) => `${time.start}:00–${time.end}:00`;
