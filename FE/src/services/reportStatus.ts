import { useSyncExternalStore } from 'react';
import type { ReportStatus } from '../types';

// 관리자가 바꾼 처리 상태를 이 브라우저 세션 동안만 보관한다.
const STORAGE_KEY = 'imleader.report-status';
const listeners = new Set<() => void>();
let version = 0;
let overrides: Record<string, ReportStatus> = load();

function load(): Record<string, ReportStatus> {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Record<string, ReportStatus>) : {};
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
  version += 1;
  listeners.forEach((listener) => listener());
}
export function getReportStatus(post: { id: string; status: ReportStatus }): ReportStatus {
  return overrides[post.id] ?? post.status;
}
export function setReportStatus(id: string, status: ReportStatus) {
  overrides = { ...overrides, [id]: status };
  persist();
  emit();
}
// 여러 보고를 한 번에 그리는 목록·홈 화면은 이 훅으로 변경을 구독한다.
export function useReportStatusVersion(): number {
  return useSyncExternalStore(subscribe, () => version);
}
export function useReportStatus(post: { id: string; status: ReportStatus }): ReportStatus {
  return useSyncExternalStore(subscribe, () => getReportStatus(post));
}
