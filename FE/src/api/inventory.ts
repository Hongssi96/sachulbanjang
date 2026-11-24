import { apiRequest } from './client';
import {
  asArray,
  asBoolean,
  asEnum,
  asNullableNumber,
  asNullableString,
  asNumber,
  asRecord,
  asString,
  parsePagination,
  toQuery,
} from './json';
import type { ListResponse } from './types';

export type MovementKind = 'initial' | 'receipt' | 'issue' | 'adjustment' | 'correction';
export type CreatableMovementKind = 'initial' | 'receipt' | 'issue' | 'adjustment';

export const MOVEMENT_KINDS: readonly MovementKind[] = [
  'initial',
  'receipt',
  'issue',
  'adjustment',
  'correction',
];

export interface StockItem {
  product_id: number;
  product_code: string | null;
  name: string;
  quantity: number;
  minimum_stock: number | null;
  is_low_stock: boolean;
}

export interface MovementItem {
  movement_id: number;
  product_id: number;
  product_code: string | null;
  product_name: string;
  kind: MovementKind;
  delta: number;
  reason: string | null;
  actor_id: number;
  actor_display_name: string;
  original_movement_id: number | null;
  checked_by_id: number | null;
  checked_at: string | null;
  created_at: string;
}

export interface MovementResult {
  movement_id: number;
  product_id: number;
  kind: MovementKind;
  delta: number;
  quantity_after: number;
  checked_at: string | null;
}

function parseStock(value: unknown, field: string): StockItem {
  const item = asRecord(value, field);
  return {
    product_id: asNumber(item.product_id, `${field}.product_id`),
    product_code: asNullableString(item.product_code, `${field}.product_code`),
    name: asString(item.name, `${field}.name`),
    quantity: asNumber(item.quantity, `${field}.quantity`),
    minimum_stock: asNullableNumber(item.minimum_stock, `${field}.minimum_stock`),
    is_low_stock: asBoolean(item.is_low_stock, `${field}.is_low_stock`),
  };
}

function parseMovement(value: unknown, field: string): MovementItem {
  const item = asRecord(value, field);
  return {
    movement_id: asNumber(item.movement_id, `${field}.movement_id`),
    product_id: asNumber(item.product_id, `${field}.product_id`),
    product_code: asNullableString(item.product_code, `${field}.product_code`),
    product_name: asString(item.product_name, `${field}.product_name`),
    kind: asEnum(item.kind, `${field}.kind`, MOVEMENT_KINDS),
    delta: asNumber(item.delta, `${field}.delta`),
    reason: asNullableString(item.reason, `${field}.reason`),
    actor_id: asNumber(item.actor_id, `${field}.actor_id`),
    actor_display_name: asString(item.actor_display_name, `${field}.actor_display_name`),
    original_movement_id: asNullableNumber(
      item.original_movement_id,
      `${field}.original_movement_id`,
    ),
    checked_by_id: asNullableNumber(item.checked_by_id, `${field}.checked_by_id`),
    checked_at: asNullableString(item.checked_at, `${field}.checked_at`),
    created_at: asString(item.created_at, `${field}.created_at`),
  };
}

export async function fetchStocks(
  params: { q?: string; lowStock?: boolean; page?: number; pageSize?: number } = {},
): Promise<ListResponse<StockItem>> {
  const payload = await apiRequest<unknown>(
    `/stocks${toQuery({
      q: params.q,
      low_stock: params.lowStock ? 'true' : undefined,
      page: params.page,
      page_size: params.pageSize,
    })}`,
  );
  return {
    items: asArray(asRecord(payload, 'response').items, 'items').map((item, index) =>
      parseStock(item, `items[${index}]`),
    ),
    pagination: parsePagination(payload, 'response'),
  };
}

export async function fetchMovements(
  params: {
    productId?: number;
    kind?: MovementKind;
    from?: string;
    to?: string;
    page?: number;
    pageSize?: number;
  } = {},
): Promise<ListResponse<MovementItem>> {
  const payload = await apiRequest<unknown>(
    `/stock-movements${toQuery({
      product_id: params.productId,
      kind: params.kind,
      from: params.from,
      to: params.to,
      page: params.page,
      page_size: params.pageSize,
    })}`,
  );
  return {
    items: asArray(asRecord(payload, 'response').items, 'items').map((item, index) =>
      parseMovement(item, `items[${index}]`),
    ),
    pagination: parsePagination(payload, 'response'),
  };
}

function parseMovementResult(payload: unknown): MovementResult {
  const item = asRecord(payload, 'movement');
  return {
    movement_id: asNumber(item.movement_id, 'movement.movement_id'),
    product_id: asNumber(item.product_id, 'movement.product_id'),
    kind: asEnum(item.kind, 'movement.kind', MOVEMENT_KINDS),
    delta: asNumber(item.delta, 'movement.delta'),
    quantity_after: asNumber(item.quantity_after, 'movement.quantity_after'),
    checked_at: asNullableString(item.checked_at, 'movement.checked_at'),
  };
}

export async function createMovement(input: {
  productId: number;
  kind: CreatableMovementKind;
  quantity: number;
  reason?: string;
}): Promise<MovementResult> {
  return parseMovementResult(
    await apiRequest<unknown>('/stock-movements', {
      method: 'POST',
      csrf: true,
      body: {
        product_id: input.productId,
        kind: input.kind,
        quantity: input.quantity,
        ...(input.reason ? { reason: input.reason } : {}),
      },
    }),
  );
}

export async function createMovementCorrection(
  movementId: number,
  input: { delta: number; reason: string },
): Promise<MovementResult> {
  return parseMovementResult(
    await apiRequest<unknown>(`/stock-movements/${movementId}/corrections`, {
      method: 'POST',
      csrf: true,
      body: input,
    }),
  );
}

export async function confirmMovement(movementId: number): Promise<MovementResult> {
  return parseMovementResult(
    await apiRequest<unknown>(`/stock-movements/${movementId}/confirmation`, {
      method: 'POST',
      csrf: true,
    }),
  );
}

export async function setMinimumStock(
  productId: number,
  minimumStock: number | null,
): Promise<{ product_id: number; minimum_stock: number | null }> {
  const payload = asRecord(
    await apiRequest<unknown>(`/products/${productId}/minimum-stock`, {
      method: 'PATCH',
      csrf: true,
      body: { minimum_stock: minimumStock },
    }),
    'minimumStock',
  );
  return {
    product_id: asNumber(payload.product_id, 'minimumStock.product_id'),
    minimum_stock: asNullableNumber(payload.minimum_stock, 'minimumStock.minimum_stock'),
  };
}
