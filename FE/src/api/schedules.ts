import { apiRequest } from './client';
import {
  asArray,
  asBoolean,
  asEnum,
  asNullableString,
  asNumber,
  asRecord,
  asString,
  parsePagination,
  toQuery,
} from './json';
import type { ListResponse } from './types';

export type ScheduleCategory = 'inspection' | 'production' | 'meeting' | 'other';

export interface ScheduleItem {
  schedule_id: number;
  title: string;
  category: ScheduleCategory;
  description: string | null;
  all_day: boolean;
  start_date: string | null;
  end_date_exclusive: string | null;
  starts_at: string | null;
  ends_at: string | null;
  author_id: number;
  author_display_name: string;
  version: number;
  created_at: string;
  updated_at: string;
}

export interface ScheduleRange {
  from?: string;
  to?: string;
  page?: number;
  pageSize?: number;
}

export interface ScheduleInput {
  title: string;
  category: ScheduleCategory;
  description?: string | null;
  allDay: boolean;
  startDate?: string;
  endDateExclusive?: string;
  startsAt?: string;
  endsAt?: string;
}

export interface ScheduleUpdateInput extends Partial<ScheduleInput> {
  version: number;
}

function parseSchedule(value: unknown, field: string): ScheduleItem {
  const item = asRecord(value, field);
  return {
    schedule_id: asNumber(item.schedule_id, `${field}.schedule_id`),
    title: asString(item.title, `${field}.title`),
    category: asEnum(item.category, `${field}.category`, [
      'inspection',
      'production',
      'meeting',
      'other',
    ] as const),
    description: asNullableString(item.description, `${field}.description`),
    all_day: asBoolean(item.all_day, `${field}.all_day`),
    start_date: asNullableString(item.start_date, `${field}.start_date`),
    end_date_exclusive: asNullableString(item.end_date_exclusive, `${field}.end_date_exclusive`),
    starts_at: asNullableString(item.starts_at, `${field}.starts_at`),
    ends_at: asNullableString(item.ends_at, `${field}.ends_at`),
    author_id: asNumber(item.author_id, `${field}.author_id`),
    author_display_name: asString(item.author_display_name, `${field}.author_display_name`),
    version: asNumber(item.version, `${field}.version`),
    created_at: asString(item.created_at, `${field}.created_at`),
    updated_at: asString(item.updated_at, `${field}.updated_at`),
  };
}

function scheduleBody(input: Partial<ScheduleInput>) {
  return {
    ...(input.title === undefined ? {} : { title: input.title }),
    ...(input.category === undefined ? {} : { category: input.category }),
    ...(input.description === undefined ? {} : { description: input.description }),
    ...(input.allDay === undefined ? {} : { all_day: input.allDay }),
    ...(input.startDate === undefined ? {} : { start_date: input.startDate }),
    ...(input.endDateExclusive === undefined ? {} : { end_date_exclusive: input.endDateExclusive }),
    ...(input.startsAt === undefined ? {} : { starts_at: input.startsAt }),
    ...(input.endsAt === undefined ? {} : { ends_at: input.endsAt }),
  };
}

export async function fetchSchedules(
  range: ScheduleRange = {},
): Promise<ListResponse<ScheduleItem>> {
  const payload = await apiRequest<unknown>(
    `/schedules${toQuery({
      from: range.from,
      to: range.to,
      page: range.page,
      page_size: range.pageSize,
    })}`,
  );
  return {
    items: asArray(asRecord(payload, 'response').items, 'items').map((item, index) =>
      parseSchedule(item, `items[${index}]`),
    ),
    pagination: parsePagination(payload, 'response'),
  };
}

export async function fetchSchedule(scheduleId: number): Promise<ScheduleItem> {
  return parseSchedule(await apiRequest<unknown>(`/schedules/${scheduleId}`), 'schedule');
}

export async function createSchedule(input: ScheduleInput): Promise<ScheduleItem> {
  return parseSchedule(
    await apiRequest<unknown>('/schedules', {
      method: 'POST',
      csrf: true,
      body: scheduleBody(input),
    }),
    'schedule',
  );
}

export async function updateSchedule(
  scheduleId: number,
  input: ScheduleUpdateInput,
): Promise<ScheduleItem> {
  return parseSchedule(
    await apiRequest<unknown>(`/schedules/${scheduleId}`, {
      method: 'PATCH',
      csrf: true,
      body: { version: input.version, ...scheduleBody(input) },
    }),
    'schedule',
  );
}

export async function deleteSchedule(scheduleId: number, expectedVersion: number): Promise<void> {
  await apiRequest<void>(
    `/schedules/${scheduleId}${toQuery({ expected_version: expectedVersion })}`,
    { method: 'DELETE', csrf: true },
  );
}
