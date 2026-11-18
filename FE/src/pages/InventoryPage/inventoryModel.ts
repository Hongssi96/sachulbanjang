export type ProductGroup = 'CN7' | 'RG3' | 'JX1' | 'SP2';
export type StockStatus = '정상' | '부족' | '품절';
export interface StockItem {
  id: string;
  name: string;
  product: ProductGroup;
  stock: number;
  reserved: number;
  safety: number;
  warehouse: string;
  bin: string;
}
export interface StockMovement {
  id: string;
  itemId: string;
  kind: 'in' | 'out';
  quantity: number;
  date: string;
  note: string;
  author: string;
}
export interface InventoryState {
  items: StockItem[];
  movements: StockMovement[];
  updatedAt: string;
}
export const initialItems: StockItem[] = [
  {
    id: 'FG-CN7-LH',
    name: 'CN7 LH',
    product: 'CN7',
    stock: 2480,
    reserved: 600,
    safety: 1200,
    warehouse: 'A창고',
    bin: 'A-01',
  },
  {
    id: 'FG-CN7-RH',
    name: 'CN7 RH',
    product: 'CN7',
    stock: 2320,
    reserved: 500,
    safety: 1200,
    warehouse: 'A창고',
    bin: 'A-02',
  },
  {
    id: 'FG-RG3-LH',
    name: 'RG3 LH',
    product: 'RG3',
    stock: 420,
    reserved: 180,
    safety: 600,
    warehouse: 'B창고',
    bin: 'B-01',
  },
  {
    id: 'FG-RG3-RH',
    name: 'RG3 RH',
    product: 'RG3',
    stock: 180,
    reserved: 120,
    safety: 500,
    warehouse: 'B창고',
    bin: 'B-02',
  },
  {
    id: 'FG-JX1-LH',
    name: 'JX1 LH',
    product: 'JX1',
    stock: 1860,
    reserved: 400,
    safety: 900,
    warehouse: 'A창고',
    bin: 'A-03',
  },
  {
    id: 'FG-JX1-RH',
    name: 'JX1 RH',
    product: 'JX1',
    stock: 1580,
    reserved: 350,
    safety: 900,
    warehouse: 'A창고',
    bin: 'A-04',
  },
  {
    id: 'FG-SP2-LH',
    name: 'SP2 LH',
    product: 'SP2',
    stock: 2280,
    reserved: 800,
    safety: 1000,
    warehouse: 'C창고',
    bin: 'C-01',
  },
  {
    id: 'FG-SP2-RH',
    name: 'SP2 RH',
    product: 'SP2',
    stock: 1360,
    reserved: 500,
    safety: 800,
    warehouse: 'C창고',
    bin: 'C-02',
  },
];
export const initialInventory: InventoryState = {
  items: initialItems,
  updatedAt: '2026-11-17T16:42:00+09:00',
  movements: [
    {
      id: 'M-005',
      itemId: 'FG-CN7-LH',
      kind: 'in',
      quantity: 480,
      date: '2026-11-17T16:35:00+09:00',
      note: '오후 생산분 검사 완료',
      author: '홍태휘',
    },
    {
      id: 'M-004',
      itemId: 'FG-CN7-RH',
      kind: 'out',
      quantity: 240,
      date: '2026-11-17T15:20:00+09:00',
      note: '납품 출고',
      author: '김가을',
    },
    {
      id: 'M-003',
      itemId: 'FG-RG3-RH',
      kind: 'out',
      quantity: 120,
      date: '2026-11-17T14:10:00+09:00',
      note: '긴급 출고',
      author: '황지혜',
    },
    {
      id: 'M-002',
      itemId: 'FG-JX1-LH',
      kind: 'in',
      quantity: 360,
      date: '2026-11-17T11:40:00+09:00',
      note: '오전 생산분 검사 완료',
      author: '홍태휘',
    },
    {
      id: 'M-001',
      itemId: 'FG-SP2-RH',
      kind: 'out',
      quantity: 200,
      date: '2026-11-17T09:30:00+09:00',
      note: '정기 납품 출고',
      author: '김가을',
    },
  ],
};
export const productGroups: ProductGroup[] = ['CN7', 'RG3', 'JX1', 'SP2'];
export const availableStock = (item: StockItem) => item.stock - item.reserved;
export function stockStatus(item: StockItem): StockStatus {
  const available = availableStock(item);
  return available === 0 ? '품절' : available < item.safety ? '부족' : '정상';
}
export function inventorySummary(items: StockItem[]) {
  return items.reduce(
    (total, item) => ({
      stock: total.stock + item.stock,
      reserved: total.reserved + item.reserved,
      available: total.available + availableStock(item),
      low: total.low + Number(stockStatus(item) !== '정상'),
    }),
    { stock: 0, reserved: 0, available: 0, low: 0 },
  );
}
export function movementError(
  item: StockItem | undefined,
  kind: 'in' | 'out',
  quantity: number,
): string {
  if (!item) return '품목을 선택해 주세요.';
  if (!Number.isSafeInteger(quantity) || quantity <= 0 || quantity > 999999)
    return '수량은 1~999,999 사이의 정수로 입력해 주세요.';
  if (kind === 'out' && quantity > availableStock(item))
    return `출고 가능한 수량은 ${availableStock(item).toLocaleString()}개입니다. 출고 예약 수량은 제외됩니다.`;
  if (kind === 'in' && item.stock + quantity > 9999999)
    return '현재고는 최대 9,999,999개까지 등록할 수 있습니다.';
  return '';
}
export function applyMovement(state: InventoryState, movement: StockMovement): InventoryState {
  const item = state.items.find((value) => value.id === movement.itemId);
  const error = movementError(item, movement.kind, movement.quantity);
  if (error) throw new Error(error);
  return {
    items: state.items.map((value) =>
      value.id === movement.itemId
        ? {
            ...value,
            stock: value.stock + (movement.kind === 'in' ? movement.quantity : -movement.quantity),
          }
        : value,
    ),
    movements: [movement, ...state.movements].slice(0, 50),
    updatedAt: movement.date,
  };
}
function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
function quantity(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 && value <= 9999999;
}
function validItem(value: unknown): value is StockItem {
  if (!record(value)) return false;
  const base = initialItems.find((item) => item.id === value.id);
  return (
    !!base &&
    value.name === base.name &&
    value.product === base.product &&
    value.warehouse === base.warehouse &&
    value.bin === base.bin &&
    quantity(value.stock) &&
    quantity(value.reserved) &&
    value.reserved <= value.stock &&
    quantity(value.safety)
  );
}
function validMovement(value: unknown): value is StockMovement {
  return (
    record(value) &&
    typeof value.id === 'string' &&
    initialItems.some((item) => item.id === value.itemId) &&
    (value.kind === 'in' || value.kind === 'out') &&
    quantity(value.quantity) &&
    value.quantity > 0 &&
    typeof value.date === 'string' &&
    Number.isFinite(Date.parse(value.date)) &&
    typeof value.note === 'string' &&
    typeof value.author === 'string'
  );
}
export function isInventoryState(value: unknown): value is InventoryState {
  return (
    record(value) &&
    Array.isArray(value.items) &&
    value.items.length === initialItems.length &&
    value.items.every(validItem) &&
    new Set(value.items.map((item: StockItem) => item.id)).size === initialItems.length &&
    Array.isArray(value.movements) &&
    value.movements.length <= 50 &&
    value.movements.every(validMovement) &&
    typeof value.updatedAt === 'string' &&
    Number.isFinite(Date.parse(value.updatedAt))
  );
}
const STORAGE_KEY = 'sachul-inventory-v1';
export function loadInventory(): InventoryState {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null');
    if (isInventoryState(value)) return value;
  } catch {
    /* 저장소를 사용할 수 없으면 시연용 초기값으로 시작한다. */
  }
  return initialInventory;
}
export function persistInventory(state: InventoryState): boolean {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    return true;
  } catch {
    return false;
  }
}
export const formatStockDate = (date: string) =>
  new Date(date).toLocaleString('ko-KR', {
    timeZone: 'Asia/Seoul',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
