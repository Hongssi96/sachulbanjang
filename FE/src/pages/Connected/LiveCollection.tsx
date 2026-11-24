import { formText, localDateTime } from '../../api/business';
import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { useAuth } from '../../hooks/useAuth';
import useRemote from '../../hooks/useRemote';
import {
  date,
  list,
  number,
  query,
  read,
  text,
  today,
  write,
  errorMessage,
} from '../../api/business';
import type { Row } from '../../api/business';
import { fetchReportJob, submitReportJob } from '../../api/reportJobs';
import type { ReportCategory } from '../../api/reports';
import { Field, MutationDialog, Pager, RemoteState, Select, Table } from './LiveShared';
import Modal from '../../components/Modal';

const statuses: [string, string][] = [
  ['pending', '접수 대기'],
  ['in_progress', '확인 중'],
  ['completed', '처리 완료'],
];
const reportCategories: [string, string][] = [
  ['equipment_issue', '설비 이상'],
  ['quality_report', '품질 보고'],
  ['inspection_done', '검사 완료'],
  ['other', '기타'],
];
const reportJobCategories: [ReportCategory, string][] = [
  ['equipment_issue', '설비 이상'],
  ['quality_report', '품질 보고'],
  ['inspection_done', '검사 완료'],
  ['other', '기타'],
];
type Kind = 'reports' | 'schedules' | 'handover-notes';

function requestKey() {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function daysAgo(days: number) {
  const kst = new Date(Date.now() + 9 * 60 * 60 * 1000);
  kst.setUTCDate(kst.getUTCDate() - days);
  return kst.toISOString().slice(0, 10);
}

function asReportCategory(value: string): ReportCategory {
  const found = reportJobCategories.find(([key]) => key === value);
  if (!found) throw new Error('보고서 종류를 선택해 주세요.');
  return found[0];
}

export default function LiveCollection({ kind, tablet = false }: { kind: Kind; tablet?: boolean }) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { reportId } = useParams();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [editing, setEditing] = useState<Row | 'new' | null>(null);
  const [selected, setSelected] = useState<number | null>(() =>
    reportId && /^\d+$/.test(reportId) ? Number(reportId) : null,
  );
  const [actionError, setActionError] = useState('');
  const [busy, setBusy] = useState(false);
  const [reportJobOpen, setReportJobOpen] = useState(false);
  const [pendingReportJob, setPendingReportJob] = useState<number | null>(null);
  const [notice, setNotice] = useState('');
  const title =
    kind === 'reports'
      ? tablet
        ? '이상 보고'
        : '올라온 보고'
      : kind === 'schedules'
        ? tablet
          ? '작업 지시 · 일정'
          : '일정 관리'
        : '인수인계';
  const idKey = kind === 'reports' ? 'report_id' : kind === 'schedules' ? 'schedule_id' : 'note_id';
  const load = useCallback(
    () =>
      list(
        query(`/${kind}`, {
          page,
          page_size: 10,
          q: kind === 'schedules' ? undefined : search,
          business_status: kind === 'reports' ? status : undefined,
          category: kind === 'reports' && tablet ? 'equipment_issue' : undefined,
        }),
      ),
    [kind, page, search, status, tablet],
  );
  const resource = useRemote(load);
  const reloadList = resource.reload;
  const loadDetail = useCallback(
    () => (selected ? read(`/${kind}/${selected}`) : Promise.resolve<Record<string, unknown>>({})),
    [kind, selected],
  );
  const detail = useRemote(loadDetail);
  const row = selected ? detail.data : null;
  const canEdit =
    row && (number(row.author_id) === user?.id || (kind === 'reports' && user?.role === 'admin'));
  const canDelete = row && (canEdit || user?.role === 'admin');
  const afterSave = () => {
    setEditing(null);
    setSelected(null);
    resource.reload();
  };
  async function act(path: string, method: 'POST' | 'PUT' | 'PATCH' | 'DELETE', body?: unknown) {
    if (busy) return;
    setBusy(true);
    setActionError('');
    try {
      await write(path, method, body);
      resource.reload();
      detail.reload();
      return true;
    } catch (reason) {
      setActionError(errorMessage(reason));
      return false;
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => {
    if (pendingReportJob === null) return;
    let cancelled = false;
    let timer = 0;
    const poll = async () => {
      try {
        const job = await fetchReportJob(pendingReportJob);
        if (cancelled) return;
        if (job.state === 'succeeded') {
          setNotice(
            job.report_id
              ? `자동 보고서가 생성되었습니다. 보고 #${job.report_id}`
              : '자동 보고서가 생성되었습니다.',
          );
          setPendingReportJob(null);
          reloadList();
          return;
        }
        if (job.state === 'failed' || job.state === 'interrupted' || job.state === 'cancelled') {
          setNotice(job.safe_error_message || '보고서 생성에 실패했습니다.');
          setPendingReportJob(null);
          reloadList();
          return;
        }
      } catch {
        // The worker may still be starting; keep polling.
      }
      if (!cancelled) timer = window.setTimeout(() => void poll(), 2500);
    };
    timer = window.setTimeout(() => void poll(), 2500);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [pendingReportJob, reloadList]);

  return (
    <div className="live-page">
      <div className="live-toolbar">
        <h1>{title}</h1>
        {kind === 'reports' ? (
          <div className="live-toolbar-actions">
            <button className="button button-white" onClick={() => setReportJobOpen(true)}>
              자동 보고서 생성
            </button>
            <button className="button button-primary" onClick={() => setEditing('new')}>
              이상 보고 작성
            </button>
          </div>
        ) : (
          <button className="button button-primary" onClick={() => setEditing('new')}>
            {kind === 'schedules' ? '일정 등록' : '노트 남기기'}
          </button>
        )}
      </div>
      {notice ? (
        <p className="live-badge" role="status">
          {notice}
        </p>
      ) : null}
      {kind === 'schedules' && tablet && (
        <p className="live-muted">
          서버에 등록된 작업·점검 일정입니다. 작업 시작·완료 상태를 저장하는 API는 아직 제공되지
          않습니다.
        </p>
      )}
      <div className="live-filters">
        {kind !== 'schedules' && (
          <label>
            검색
            <input
              value={search}
              onChange={(event) => {
                setSearch(event.target.value);
                setPage(1);
              }}
              placeholder="제목 또는 내용 검색"
            />
          </label>
        )}
        {kind === 'reports' && (
          <div className="live-tabs">
            {[['', '전체'], ...statuses].map(([key, label]) => (
              <button
                key={key}
                aria-pressed={status === key}
                onClick={() => {
                  setStatus(key);
                  setPage(1);
                }}
              >
                {label}
              </button>
            ))}
          </div>
        )}
        <button className="button button-white" onClick={resource.reload}>
          새로고침
        </button>
      </div>
      <RemoteState {...resource} retry={resource.reload} />
      {resource.data && (
        <>
          <section className="live-card">
            <Table
              rows={resource.data.items}
              columns={
                kind === 'handover-notes'
                  ? [
                      ['body', '전달 내용'],
                      ['author_display_name', '작성자'],
                      ['created_at', '작성 일시', (item) => date(item.created_at)],
                      [
                        'my_confirmed_at',
                        '확인 상태',
                        (item) => (item.my_confirmed_at ? '확인 완료' : '미확인'),
                      ],
                    ]
                  : kind === 'reports'
                    ? [
                        ['title', '제목'],
                        ['author_display_name', '작성자'],
                        [
                          'business_status',
                          '상태',
                          (item) =>
                            statuses.find(([key]) => key === item.business_status)?.[1] ??
                            text(item.business_status),
                        ],
                        ['created_at', '작성 일시', (item) => date(item.created_at)],
                      ]
                    : [
                        ['title', '일정'],
                        [
                          'starts_at',
                          '시작',
                          (item) => date(item.all_day ? item.start_date : item.starts_at),
                        ],
                        [
                          'ends_at',
                          '종료',
                          (item) => date(item.all_day ? item.end_date_exclusive : item.ends_at),
                        ],
                        ['author_display_name', '작성자'],
                      ]
              }
              action={(item) =>
                kind === 'reports' ? (
                  <button
                    className="button button-white"
                    onClick={() => navigate(`/reports/${number(item.report_id)}`)}
                  >
                    상세 보기
                  </button>
                ) : (
                  <button
                    className="button button-white"
                    onClick={() => {
                      setSelected(number(item[idKey]));
                      setActionError('');
                    }}
                  >
                    상세 보기
                  </button>
                )
              }
            />
          </section>
          <Pager data={resource.data} page={page} setPage={setPage} />
        </>
      )}
      {selected && !editing && (
        <Modal
          title={`${title} 상세`}
          onClose={() => {
            if (!busy) setSelected(null);
          }}
        >
          <RemoteState {...detail} retry={detail.reload} />
          {row && (
            <div className="live-form">
              <h3>{text(row.title ?? row.author_display_name)}</h3>
              <p className="live-muted">
                {text(row.author_display_name)} · {date(row.created_at)}
              </p>
              <p className="live-body">{text(row.body_markdown ?? row.body ?? row.description)}</p>
              {kind === 'schedules' && (
                <p>
                  {date(row.all_day ? row.start_date : row.starts_at)} –{' '}
                  {date(row.all_day ? row.end_date_exclusive : row.ends_at)}
                  {row.all_day ? ' (종료일 미포함)' : ''}
                </p>
              )}
              {actionError && (
                <p className="live-error" role="alert">
                  {actionError}
                </p>
              )}
              {kind === 'handover-notes' && (
                <button
                  className="button button-primary"
                  disabled={busy || Boolean(row.my_confirmed_at)}
                  onClick={() => void act(`/${kind}/${selected}/confirmation`, 'PUT')}
                >
                  {row.my_confirmed_at ? '확인 완료' : busy ? '저장 중…' : '확인함'}
                </button>
              )}
              {kind === 'reports' && user?.role === 'admin' && (
                <label>
                  처리 상태
                  <select
                    value={text(row.business_status)}
                    disabled={busy}
                    onChange={(event) =>
                      void act(`/${kind}/${selected}/status`, 'PATCH', {
                        version: row.version,
                        business_status: event.target.value,
                      })
                    }
                  >
                    {statuses.map(([key, label]) => (
                      <option key={key} value={key}>
                        {label}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              {canEdit && (
                <button className="button button-white" onClick={() => setEditing(row)}>
                  수정
                </button>
              )}
              {canDelete && (
                <button
                  className="button button-white"
                  disabled={busy}
                  onClick={() => {
                    if (window.confirm('이 기록을 삭제할까요?'))
                      void act(
                        `/${kind}/${selected}?expected_version=${number(row.version)}`,
                        'DELETE',
                      ).then((success) => {
                        if (success) setSelected(null);
                      });
                  }}
                >
                  삭제
                </button>
              )}
            </div>
          )}
        </Modal>
      )}
      {editing && (
        <MutationDialog
          title={`${title} ${editing === 'new' ? '작성' : '수정'}`}
          close={afterSave}
          submit={async (form) => {
            const old = editing === 'new' ? null : editing;
            let body: Row = old ? { version: old.version } : {};
            if (kind === 'reports')
              body = {
                ...body,
                title: formText(form, 'title'),
                body_markdown: formText(form, 'body'),
                ...(!old ? { category: formText(form, 'category'), report_kind: 'general' } : {}),
              };
            else if (kind === 'handover-notes') body = { ...body, body: formText(form, 'body') };
            else if (old?.all_day) {
              body = {
                ...body,
                title: formText(form, 'title'),
                description: formText(form, 'body'),
                category: formText(form, 'category'),
                start_date: formText(form, 'start_date'),
                end_date_exclusive: formText(form, 'end_date'),
              };
            } else {
              const starts = new Date(formText(form, 'starts'));
              const ends = new Date(formText(form, 'ends'));
              if (!(ends > starts)) throw new Error('종료 시각은 시작 시각보다 뒤여야 합니다.');
              body = {
                ...body,
                title: formText(form, 'title'),
                category: formText(form, 'category'),
                description: formText(form, 'body'),
                all_day: false,
                starts_at: starts.toISOString(),
                ends_at: ends.toISOString(),
              };
            }
            await write(
              `/${kind}${old ? `/${number(old[idKey])}` : ''}`,
              old ? 'PATCH' : 'POST',
              body,
            );
          }}
        >
          {kind !== 'handover-notes' && (
            <Field name="title" label="제목" value={editing === 'new' ? '' : text(editing.title)} />
          )}
          {kind !== 'handover-notes' && (editing === 'new' || kind === 'schedules') && (
            <Select
              name="category"
              label="분류"
              value={editing === 'new' ? undefined : text(editing.category)}
              options={
                kind === 'reports'
                  ? reportCategories
                  : [
                      ['inspection', '점검'],
                      ['production', '생산'],
                      ['meeting', '회의'],
                      ['other', '기타'],
                    ]
              }
            />
          )}
          {kind === 'schedules' && editing !== 'new' && Boolean(editing.all_day) ? (
            <>
              <Field
                name="start_date"
                label="시작일"
                type="date"
                value={text(editing.start_date)}
              />
              <Field
                name="end_date"
                label="종료일 (미포함)"
                type="date"
                value={text(editing.end_date_exclusive)}
              />
            </>
          ) : (
            kind === 'schedules' && (
              <>
                <Field
                  name="starts"
                  label="시작 시각 (이 기기의 현지 시간)"
                  type="datetime-local"
                  value={editing === 'new' ? `${today()}T09:00` : localDateTime(editing.starts_at)}
                />
                <Field
                  name="ends"
                  label="종료 시각 (이 기기의 현지 시간)"
                  type="datetime-local"
                  value={editing === 'new' ? `${today()}T10:00` : localDateTime(editing.ends_at)}
                />
              </>
            )
          )}
          <label>
            내용
            <textarea
              name="body"
              required={kind !== 'schedules'}
              defaultValue={
                editing === 'new'
                  ? ''
                  : text(editing.body_markdown ?? editing.body ?? editing.description ?? '')
              }
            />
          </label>
        </MutationDialog>
      )}
      {kind === 'reports' && reportJobOpen && (
        <MutationDialog
          title="자동 보고서 생성"
          close={() => setReportJobOpen(false)}
          label="생성 요청"
          submit={async (form) => {
            const result = await submitReportJob({
              clientRequestKey: requestKey(),
              category: asReportCategory(formText(form, 'category')),
              reportKind: 'general',
              from: formText(form, 'from') || undefined,
              to: formText(form, 'to') || undefined,
            });
            setNotice(
              `자동 보고서 생성을 요청했습니다. 작업 #${result.job_id} 완료 후 목록에 자동으로 표시됩니다.`,
            );
            setPendingReportJob(result.job_id);
            resource.reload();
          }}
        >
          <Select name="category" label="보고서 종류" options={reportJobCategories} />
          <Field name="from" label="시작일" type="date" value={daysAgo(6)} />
          <Field name="to" label="종료일" type="date" value={today()} />
        </MutationDialog>
      )}
    </div>
  );
}
