import { apiRequest } from './client';
import { asNumber, asRecord, asString } from './json';

export interface WorkSession {
  ends_at: string;
  warning_starts_at: string;
  server_time: string;
  version: number;
}

export interface WorkSessionExtensionInput {
  kind: 'automatic' | 'manual';
  expectedEndsAt: string;
  endsAt?: string;
}

function parseWorkSession(payload: unknown): WorkSession {
  const item = asRecord(payload, 'workSession');
  return {
    ends_at: asString(item.ends_at, 'workSession.ends_at'),
    warning_starts_at: asString(item.warning_starts_at, 'workSession.warning_starts_at'),
    server_time: asString(item.server_time, 'workSession.server_time'),
    version: asNumber(item.version, 'workSession.version'),
  };
}

export async function fetchWorkSession(): Promise<WorkSession> {
  return parseWorkSession(await apiRequest<unknown>('/work-session'));
}

export async function extendWorkSession(input: WorkSessionExtensionInput): Promise<WorkSession> {
  return parseWorkSession(
    await apiRequest<unknown>('/work-session/extensions', {
      method: 'POST',
      csrf: true,
      body: {
        kind: input.kind,
        expected_ends_at: input.expectedEndsAt,
        ...(input.endsAt === undefined ? {} : { ends_at: input.endsAt }),
      },
    }),
  );
}
