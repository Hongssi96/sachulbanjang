import type { ChatTurn, ChatTurnJob } from '../../api/conversations';

/** API에 값이 없을 때 화면에 표시하는 문자. */
export const NA = '—';

/** 검색어 주변의 실제 대화 내용만 미리 보여 준다. 권한으로 숨긴 답변은 제외한다. */
export function conversationPreview(turns: ChatTurn[], query: string): string {
  const keyword = query.trim().toLowerCase();
  const contents = turns.flatMap((turn) => [
    turn.question,
    ...(turn.answer_status !== 'hidden_permission' && turn.answer ? [turn.answer] : []),
  ]);
  const matched = keyword
    ? contents.find((text) => text.toLowerCase().includes(keyword))
    : undefined;
  const text = (matched ?? turns.at(-1)?.question ?? '').replace(/\s+/g, ' ').trim();
  if (!text) return '아직 주고받은 내용이 없어요.';
  const matchIndex = keyword ? text.toLowerCase().indexOf(keyword) : -1;
  const start = Math.max(0, matchIndex - 40);
  const end = start + 180;
  return `${start > 0 ? '…' : ''}${text.slice(start, end)}${text.length > end ? '…' : ''}`;
}

const RUNNING_JOB_STATES: readonly ChatTurnJob['state'][] = ['accepted', 'querying', 'writing'];

const PROGRESS_LABELS: Partial<Record<ChatTurnJob['state'], string>> = {
  accepted: '질문을 접수했어요. 답변을 준비하는 중이에요.',
  querying: '검사 기록을 조회하는 중이에요.',
  writing: '답변을 작성하는 중이에요.',
};

export function isJobRunning(job: ChatTurnJob | null): boolean {
  return job !== null && RUNNING_JOB_STATES.includes(job.state);
}

export function isRetryableTurn(turn: ChatTurn): boolean {
  return turn.job?.state === 'failed' || turn.job?.state === 'interrupted';
}

export type TurnAnswer =
  | { kind: 'answer'; text: string; note: string | null }
  | { kind: 'pending'; text: string }
  | { kind: 'failed'; text: string }
  | { kind: 'cancelled'; text: string }
  | { kind: 'hidden'; text: string }
  | { kind: 'missing'; text: string };

/**
 * 한 질문(turn)의 답변 영역에 표시할 내용을 정한다.
 * 서버가 준 답변·상태·오류 메시지만 사용하고, 없는 값은 '—'로 둔다.
 */
export function turnAnswer(turn: ChatTurn): TurnAnswer {
  if (turn.answer_status === 'hidden_permission') {
    return { kind: 'hidden', text: '권한이 없어 이 답변을 볼 수 없어요.' };
  }
  if (turn.answer !== null) {
    return {
      kind: 'answer',
      text: turn.answer,
      note:
        turn.answer_status === 'available_with_deleted_evidence'
          ? '근거 자료가 삭제되어 참고용으로 표시해요.'
          : null,
    };
  }
  const job = turn.job;
  if (job) {
    if (job.state === 'failed' || job.state === 'interrupted') {
      return { kind: 'failed', text: job.safe_error_message ?? NA };
    }
    if (job.state === 'cancelled') {
      return { kind: 'cancelled', text: '답변 생성이 취소되었어요.' };
    }
    if (isJobRunning(job)) {
      return { kind: 'pending', text: PROGRESS_LABELS[job.state] ?? '답변을 준비하는 중이에요.' };
    }
  }
  return { kind: 'missing', text: NA };
}

export interface TurnSource {
  href: string;
  label: string;
}

/** 원본 답변의 근거 링크 자리에 연결할 화면 주소. 근거가 없으면 만들지 않는다. */
export function turnSources(turn: ChatTurn): TurnSource[] {
  const sources: TurnSource[] = [];
  const seen = new Set<string>();
  for (const evidence of turn.evidence) {
    const candidates: TurnSource[] = [];
    if (evidence.report_id !== null) {
      candidates.push({ href: `/reports/${evidence.report_id}`, label: '근거 보고서' });
    }
    if (evidence.inspection_record_id !== null) {
      candidates.push({
        href: `/records/${evidence.inspection_record_id}`,
        label: '근거 검사 기록',
      });
    }
    if (evidence.process_record_id !== null) {
      candidates.push({
        href: `/records/${evidence.process_record_id}?view=production`,
        label: '근거 생산 기록',
      });
    }
    for (const candidate of candidates) {
      if (seen.has(candidate.href)) continue;
      seen.add(candidate.href);
      sources.push(candidate);
    }
  }
  return sources;
}
