import { apiRequest } from './client';
import {
  asArray,
  asBoolean,
  asDecimal,
  asNullableEnum,
  asNullableNumber,
  asNullableString,
  asNumber,
  asRecord,
  asString,
  toQuery,
} from './json';

export type ReplayState = 'ready' | 'running' | 'delayed' | 'completed' | 'failed';

export interface CurrentProcessItem {
  equipment_id: number;
  equipment_code: string;
  equipment_name: string;
  equipment_status: 'unknown';
  product_id: number | null;
  product_code: string | null;
  product_name: string | null;
  cycle_time_seconds: number | null;
  occurred_at: string;
  available_at: string;
  is_demo: boolean;
}

export interface CurrentProcess {
  queried_at: string;
  replay_id: number | null;
  replay_state: ReplayState | null;
  data_time: string | null;
  last_advanced_at: string | null;
  items: CurrentProcessItem[];
}

function parseItem(value: unknown, field: string): CurrentProcessItem {
  const item = asRecord(value, field);
  return {
    equipment_id: asNumber(item.equipment_id, `${field}.equipment_id`),
    equipment_code: asString(item.equipment_code, `${field}.equipment_code`),
    equipment_name: asString(item.equipment_name, `${field}.equipment_name`),
    equipment_status: 'unknown',
    product_id: asNullableNumber(item.product_id, `${field}.product_id`),
    product_code: asNullableString(item.product_code, `${field}.product_code`),
    product_name: asNullableString(item.product_name, `${field}.product_name`),
    cycle_time_seconds: asDecimal(item.cycle_time_seconds, `${field}.cycle_time_seconds`),
    occurred_at: asString(item.occurred_at, `${field}.occurred_at`),
    available_at: asString(item.available_at, `${field}.available_at`),
    is_demo: asBoolean(item.is_demo, `${field}.is_demo`),
  };
}

export async function fetchCurrentProcess(equipmentId?: number): Promise<CurrentProcess> {
  const payload = asRecord(
    await apiRequest<unknown>(`/process/current${toQuery({ equipment_id: equipmentId })}`),
    'currentProcess',
  );
  return {
    queried_at: asString(payload.queried_at, 'currentProcess.queried_at'),
    replay_id: asNullableNumber(payload.replay_id, 'currentProcess.replay_id'),
    replay_state: asNullableEnum(payload.replay_state, 'currentProcess.replay_state', [
      'ready',
      'running',
      'delayed',
      'completed',
      'failed',
    ] as const),
    data_time: asNullableString(payload.data_time, 'currentProcess.data_time'),
    last_advanced_at: asNullableString(payload.last_advanced_at, 'currentProcess.last_advanced_at'),
    items: asArray(payload.items, 'currentProcess.items').map((item, index) =>
      parseItem(item, `items[${index}]`),
    ),
  };
}
