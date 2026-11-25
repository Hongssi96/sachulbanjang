import { useSyncExternalStore } from 'react';

// 보고 처리 상태가 바뀌면 셸(사이드바 배지)이 다시 조회하도록 알린다.
// 여러 화면이 같은 목록을 중복 보관하지 않고, 변경 시점에만 갱신한다.
const listeners = new Set<() => void>();
let version = 0;

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function notifyReportsChanged() {
  version += 1;
  listeners.forEach((listener) => listener());
}

export function useReportsVersion(): number {
  return useSyncExternalStore(subscribe, () => version);
}
