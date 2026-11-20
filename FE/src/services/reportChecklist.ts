import { useSyncExternalStore } from 'react';

// 보고 상세의 요청 사항 체크 상태를 이 브라우저 세션 동안만 보관한다.
const STORAGE_KEY = 'imleader.report-checklist';
const listeners = new Set<() => void>();
let overrides: Record<string, boolean[]> = load();

function load(): Record<string, boolean[]> {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Record<string, boolean[]>) : {};
  } catch {
    return {};
  }
}
function persist() {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(overrides));
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
export function setReportChecklist(id: string, checked: boolean[]) {
  overrides = { ...overrides, [id]: checked };
  persist();
  emit();
}
export function useReportChecklist(id: string): boolean[] | undefined {
  return useSyncExternalStore(subscribe, () => overrides[id]);
}
