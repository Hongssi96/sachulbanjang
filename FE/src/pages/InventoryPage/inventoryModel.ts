import { formatNumber } from '../../utils/numberFormat';
import { fetchStocks } from '../../api/inventory';
import type { MovementKind, StockItem } from '../../api/inventory';
import { formatDateTime } from '../../utils/dateFormat';

export type { MovementItem, MovementKind, StockItem } from '../../api/inventory';

/** API가 값을 제공하지 않는 항목의 표시값. */
export const NOT_AVAILABLE = '—';

export type StockStatus = '정상' | '부족';
export type MovementFilter = 'all' | 'in' | 'out';

/** 서버의 is_low_stock은 안전재고 미달 여부만 알려준다(품절 구분 없음). */
export function stockStatus(isLowStock: boolean): StockStatus {
  return isLowStock ? '부족' : '정상';
}

export interface InventorySummary {
  stock: number;
  low: number;
  count: number;
}

export function inventorySummary(items: StockItem[]): InventorySummary {
  return items.reduce(
    (total, item) => ({
      stock: total.stock + item.quantity,
      low: total.low + Number(item.is_low_stock),
      count: total.count + 1,
    }),
    { stock: 0, low: 0, count: 0 },
  );
}

export function formatStockNumber(value: number | null | undefined): string {
  return value === null || value === undefined ? NOT_AVAILABLE : formatNumber(value);
}

export function formatMinimumStock(value: number | null): string {
  return value === null ? '미설정' : formatNumber(value);
}

export const MOVEMENT_KIND_LABELS: Record<MovementKind, string> = {
  initial: '초기',
  receipt: '입고',
  issue: '출고',
  adjustment: '조정',
  correction: '정정',
};

export function movementKindLabel(kind: MovementKind): string {
  return MOVEMENT_KIND_LABELS[kind];
}

/** 화면의 전체·입고·출고 탭을 서버 유형 필터로 옮긴다. */
export function movementFilterKind(filter: MovementFilter): MovementKind | undefined {
  if (filter === 'in') return 'receipt';
  if (filter === 'out') return 'issue';
  return undefined;
}

export function movementTone(delta: number): 'in' | 'out' {
  return delta >= 0 ? 'in' : 'out';
}

export function movementSymbol(delta: number): '+' | '−' {
  return delta >= 0 ? '+' : '−';
}

export function movementAmount(delta: number): string {
  return formatNumber(Math.abs(delta));
}

/**
 * KPI 합계는 페이지와 무관하게 전체 품목이 필요하므로,
 * 서버 페이지네이션을 끝까지 읽어 목록을 만든다.
 */
export async function fetchAllStocks(): Promise<StockItem[]> {
  const pageSize = 100;
  const first = await fetchStocks({ page: 1, pageSize });
  const items = [...first.items];
  for (let page = 2; page <= first.pagination.total_pages; page += 1) {
    const next = await fetchStocks({ page, pageSize });
    items.push(...next.items);
  }
  return items;
}

export function formatStockDate(value: string | null): string {
  return value === null ? NOT_AVAILABLE : formatDateTime(value);
}
