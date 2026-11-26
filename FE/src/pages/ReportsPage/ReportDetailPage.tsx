import { usePageEntryReady } from '../../components/PageEntry/PageEntryContext';
import { useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import { Link, useParams } from 'react-router';
import {
  ArrowLeft,
  ArrowRight,
  Check,
  ClipboardList,
  Download,
  Eye,
  FileText,
  Pencil,
  X,
} from 'lucide-react';
import {
  changeReportStatus,
  fetchReport,
  fetchReports,
  updateReport,
  type ReportCategory,
  type ReportStatus,
} from '../../api/reports';
import { ApiError, apiRequestBlob } from '../../api/client';
import { createHandoverNote } from '../../api/handover';
import ApiErrorState from '../../components/ApiErrorState';
import Modal from '../../components/Modal';
import ReportDetailSkeleton from './ReportDetailSkeleton';
import { setReportChecklist, useReportChecklist } from '../../services/reportChecklist';
import { notifyReportsChanged } from '../../services/reportSignals';
import { reportTasks } from '../../services/reportTasks';
import { useApiQuery } from '../../hooks/useApiQuery';
import { useAuth } from '../../hooks/useAuth';
import { formatDateTime } from '../../utils/dateFormat';
import ReportMarkdown from '../../components/ReportMarkdown';
import {
  parseMarkdownBlocks,
  serializeMarkdownBlocks,
  type MarkdownBlock,
  type MarkdownTable,
} from './reportTableMarkdown';
import ReportTableEditor from './ReportTableEditor';
import './ReportsPage.css';

type StatusLabel = '대기' | '진행 중' | '완료';

const statusOptions: StatusLabel[] = ['대기', '진행 중', '완료'];
const statusToLabel: Record<ReportStatus, StatusLabel> = {
  pending: '대기',
  in_progress: '진행 중',
  completed: '완료',
};
const labelToStatus: Record<StatusLabel, ReportStatus> = {
  대기: 'pending',
  '진행 중': 'in_progress',
  완료: 'completed',
};
const statusPill: Record<StatusLabel, string> = {
  대기: 'pill-amber',
  '진행 중': 'pill-violet',
  완료: 'pill-green',
};
const categoryLabels: Record<ReportCategory, string> = {
  equipment_issue: '설비 이상',
  quality_report: '품질 보고',
  inspection_done: '점검 완료',
  periodic_weekly: '주간 보고',
  periodic_monthly: '월간 보고',
  other: '기타',
};
// 저장된 체크 상태가 없으면 처리 상태에 맞는 기본값으로 시작한다.
function defaultChecklist(status: StatusLabel, length: number): boolean[] {
  if (status === '완료') return Array.from({ length }, () => true);
  if (status === '진행 중') return Array.from({ length }, (_, index) => index === 0);
  return Array.from({ length }, () => false);
}

export default function ReportDetailPage() {
  const { reportId } = useParams();
  const id = Number(reportId);
  const validId = Number.isInteger(id) && id >= 1;
  const detailQuery = useApiQuery(`report:${id}`, () => fetchReport(id), { enabled: validId });
  usePageEntryReady(!validId || !detailQuery.loading);
  // 이전·다음 글은 목록에서 현재 위치로 계산한다.
  const listQuery = useApiQuery('report-neighbors', () => fetchReports({ pageSize: 100 }), {
    enabled: validId,
  });
  const storedChecklist = useReportChecklist(reportId ?? '');
  const { user } = useAuth();
  const [statusError, setStatusError] = useState('');
  const [saving, setSaving] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState('');
  const [draft, setDraft] = useState({ title: '', bodyMarkdown: '' });
  const [handoverOpen, setHandoverOpen] = useState(false);
  const [handoverText, setHandoverText] = useState('');
  const [handoverSaving, setHandoverSaving] = useState(false);
  const [handoverError, setHandoverError] = useState('');
  const [handoverNotice, setHandoverNotice] = useState('');
  const [bodyMode, setBodyMode] = useState<'blocks' | 'markdown'>('blocks');
  // 본문을 텍스트 구간과 표 구간으로 나눠, 표는 본문에 있던 위치에서 그리드로 보여 준다.
  const draftBlocks = useMemo(() => parseMarkdownBlocks(draft.bodyMarkdown), [draft.bodyMarkdown]);

  const post = detailQuery.data;
  const items = listQuery.data?.items ?? [];
  const index = items.findIndex((item) => item.report_id === id);
  const newer = index > 0 ? items[index - 1] : null;
  const older = index >= 0 && index < items.length - 1 ? items[index + 1] : null;
  const tasks = useMemo(
    () => reportTasks(post ?? { category: 'other', generation_snapshot: null }),
    [post],
  );
  const checklist = tasks.items;
  const currentStatus = post ? statusToLabel[post.business_status] : '대기';
  const checked =
    storedChecklist?.length === checklist.length
      ? storedChecklist
      : defaultChecklist(currentStatus, checklist.length);
  const completedCount = checked.filter(Boolean).length;

  // 체크 상태가 처리 상태를 정한다. 하나도 없으면 대기, 모두 체크면 완료, 그 사이는 진행 중.
  const statusForChecklist = (values: boolean[]): StatusLabel => {
    const done = values.filter(Boolean).length;
    if (done === 0) return '대기';
    if (done === values.length) return '완료';
    return '진행 중';
  };
  const saveStatus = async (id: number, version: number, option: StatusLabel): Promise<boolean> => {
    setSaving(true);
    setStatusError('');
    try {
      await changeReportStatus(id, version, labelToStatus[option]);
      detailQuery.reload();
      // 사이드바 배지가 새 처리 상태를 바로 반영하도록 셸에 알린다.
      notifyReportsChanged();
      return true;
    } catch (error: unknown) {
      setStatusError(error instanceof Error ? error.message : '상태를 변경하지 못했어요.');
      return false;
    } finally {
      setSaving(false);
    }
  };

  const toggleItem = (target: number) => {
    if (!post || saving || !checklist.length) return;
    const previous = checked;
    const next = checked.map((value, itemIndex) => (itemIndex === target ? !value : value));
    setReportChecklist(String(post.report_id), next);

    const nextStatus = statusForChecklist(next);
    if (nextStatus === currentStatus) return;
    void saveStatus(post.report_id, post.version, nextStatus).then((ok) => {
      // 서버 반영에 실패하면 체크 상태를 이전으로 되돌려 화면과 처리 상태를 맞춘다.
      if (!ok) setReportChecklist(String(post.report_id), previous);
    });
  };
  const changeStatus = async (option: StatusLabel) => {
    if (!post || saving) return;
    const ok = await saveStatus(post.report_id, post.version, option);
    // 처리 상태를 직접 바꾸면 체크 상태도 그에 맞춘다.
    if (ok) setReportChecklist(String(post.report_id), defaultChecklist(option, checklist.length));
  };

  const downloadPdf = async () => {
    if (!post) return;
    setDownloading(true);
    setStatusError('');
    try {
      const blob = await apiRequestBlob(`/reports/${post.report_id}/pdf`);
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `report-${post.report_id}-v${post.version}.pdf`;
      anchor.click();
      URL.revokeObjectURL(url);
    } catch (error: unknown) {
      setStatusError(error instanceof Error ? error.message : 'PDF를 내려받지 못했어요.');
    } finally {
      setDownloading(false);
    }
  };

  if (!validId || (!detailQuery.loading && !post)) {
    return (
      <section className="reports-page">
        <div className="rp-empty">
          <FileText size={34} />
          <strong>보고를 찾을 수 없어요</strong>
          <p>삭제되었거나 잘못된 주소입니다.</p>
          <Link className="button button-primary" to="/reports">
            목록으로 돌아가기
          </Link>
        </div>
      </section>
    );
  }
  if (detailQuery.loading && !post) {
    return <ReportDetailSkeleton />;
  }
  if (detailQuery.error || !post) {
    return (
      <section className="reports-page">
        <ApiErrorState
          error={detailQuery.error ?? new Error('보고를 불러오지 못했어요.')}
          onRetry={detailQuery.reload}
        />
      </section>
    );
  }

  // 작성자는 완료 전까지, 관리자는 처리 상태와 무관하게 제목·본문을 고칠 수 있다.
  const canEdit = Boolean(
    user &&
    (user.role === 'admin' || (user.id === post.author_id && post.business_status !== 'completed')),
  );
  // BE가 내려주는 작성자 담당 설비를 오른쪽 요약 카드에 보여 준다.
  const equipmentNames = post.author_equipment.map((equipment) => equipment.name || equipment.code);
  const equipmentLabel =
    equipmentNames.length > 3
      ? `${equipmentNames.slice(0, 3).join(', ')} 외 ${equipmentNames.length - 3}대`
      : equipmentNames.join(', ');
  const startEdit = () => {
    setDraft({ title: post.title, bodyMarkdown: post.body_markdown });
    setBodyMode('blocks');
    setEditError('');
    setEditing(true);
  };
  const cancelEdit = () => {
    setEditing(false);
    setEditError('');
  };
  const saveEdit = async () => {
    const title = draft.title.trim();
    const bodyMarkdown = draft.bodyMarkdown;
    if (!title) {
      setEditError('제목을 입력해 주세요.');
      return;
    }
    if (!bodyMarkdown.trim()) {
      setEditError('본문을 입력해 주세요.');
      return;
    }
    if (title === post.title && bodyMarkdown === post.body_markdown) {
      setEditError('변경된 내용이 없어요.');
      return;
    }
    setEditSaving(true);
    setEditError('');
    try {
      await updateReport(post.report_id, { version: post.version, title, bodyMarkdown });
      setEditing(false);
      detailQuery.reload();
      notifyReportsChanged();
    } catch (error: unknown) {
      setEditError(error instanceof Error ? error.message : '보고를 수정하지 못했어요.');
      // 다른 사용자가 먼저 저장했으면 최신 버전을 다시 받아 이어서 수정할 수 있게 한다.
      if (error instanceof ApiError && error.status === 409) detailQuery.reload();
    } finally {
      setEditSaving(false);
    }
  };

  const openHandover = () => {
    setHandoverText(`${post.title}: 조치 결과 확인 필요`);
    setHandoverError('');
    setHandoverNotice('');
    setHandoverOpen(true);
  };
  const submitHandover = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const body = handoverText.trim();
    if (!body) {
      setHandoverError('전달할 내용을 입력해 주세요.');
      return;
    }
    setHandoverSaving(true);
    setHandoverError('');
    try {
      await createHandoverNote({ body });
      setHandoverOpen(false);
      setHandoverNotice('인수인계 노트에 기록했어요.');
    } catch (error: unknown) {
      setHandoverError(
        error instanceof Error ? error.message : '인수인계 노트를 저장하지 못했어요.',
      );
    } finally {
      setHandoverSaving(false);
    }
  };

  // 본문 블록을 다시 합쳐 마크다운으로 만든다. 표 편집기의 변경도 여기로 모인다.
  const updateBlocks = (change: (blocks: MarkdownBlock[]) => void) => {
    setDraft((previous) => {
      const blocks = parseMarkdownBlocks(previous.bodyMarkdown);
      change(blocks);
      return { ...previous, bodyMarkdown: serializeMarkdownBlocks(blocks) };
    });
  };
  const setTextBlock = (blockIndex: number, value: string) =>
    updateBlocks((blocks) => {
      blocks[blockIndex] = { kind: 'text', lines: value.split('\n') };
    });
  const setTableBlock = (blockIndex: number, table: MarkdownTable) =>
    updateBlocks((blocks) => {
      blocks[blockIndex] = { kind: 'table', table };
    });
  const removeTableBlock = (blockIndex: number) =>
    updateBlocks((blocks) => {
      blocks.splice(blockIndex, 1);
    });
  // 표를 앞뒤의 본문 구간과 바꿔 위치를 옮긴다. 빈 줄만 있는 구간은 건너뛴다.
  const moveTableBlock = (blockIndex: number, direction: -1 | 1) =>
    updateBlocks((blocks) => {
      if (blocks[blockIndex]?.kind !== 'table') return;
      let target = blockIndex + direction;
      while (target >= 0 && target < blocks.length) {
        const candidate = blocks[target];
        if (candidate.kind === 'table' || candidate.lines.some((line) => line.trim() !== '')) {
          break;
        }
        target += direction;
      }
      if (target < 0 || target >= blocks.length) return;
      [blocks[blockIndex], blocks[target]] = [blocks[target], blocks[blockIndex]];
      // 표끼리 맞붙으면 한 표로 합쳐지므로 빈 줄 구간을 하나 넣어 둔다.
      let movedIndex = target;
      if (blocks[movedIndex - 1]?.kind === 'table') {
        blocks.splice(movedIndex, 0, { kind: 'text', lines: [''] });
        movedIndex += 1;
      }
      if (blocks[movedIndex + 1]?.kind === 'table') {
        blocks.splice(movedIndex + 1, 0, { kind: 'text', lines: [''] });
      }
    });

  const blockHasContent = (block: MarkdownBlock) =>
    block.kind === 'table' || block.lines.some((line) => line.trim() !== '');
  let tableNumber = 0;
  let textNumber = 0;
  let emptyEditorShown = false;
  const hasBodyContent = draftBlocks.some(blockHasContent);
  const bodyEditor = draftBlocks.map((block, blockIndex) => {
    if (block.kind === 'table') {
      tableNumber += 1;
      return (
        <ReportTableEditor
          key={`table-${blockIndex}`}
          table={block.table}
          label={`표 ${tableNumber}`}
          onChange={(table) => setTableBlock(blockIndex, table)}
          onRemove={() => removeTableBlock(blockIndex)}
          canMoveUp={draftBlocks.slice(0, blockIndex).some(blockHasContent)}
          canMoveDown={draftBlocks.slice(blockIndex + 1).some(blockHasContent)}
          onMoveUp={() => moveTableBlock(blockIndex, -1)}
          onMoveDown={() => moveTableBlock(blockIndex, 1)}
        />
      );
    }
    // 표 사이의 빈 줄만 있는 구간은 편집 상자 없이 여백으로 둔다.
    // 다만 본문에 남은 내용이 없으면 빈 본문을 입력할 수 있도록 하나는 남긴다.
    if (block.lines.every((line) => line.trim() === '')) {
      if (hasBodyContent || emptyEditorShown) return null;
      emptyEditorShown = true;
    }
    textNumber += 1;
    return (
      <textarea
        key={`text-${blockIndex}`}
        aria-label={`본문 구간 ${textNumber}`}
        value={block.lines.join('\n')}
        onChange={(event) => setTextBlock(blockIndex, event.target.value)}
      />
    );
  });

  return (
    <section className="reports-page rpd-page">
      <Link className="rpd-back" to="/reports">
        <ArrowLeft size={16} />
        목록으로
      </Link>
      <article className="rpd-article">
        <header className="rpd-header">
          <div className="rpd-tags">
            <span className="rp-category">{categoryLabels[post.category]}</span>
            <span className={`pill ${statusPill[currentStatus]}`}>{currentStatus}</span>
            {canEdit && !editing && (
              <button
                type="button"
                className="button button-white button-sm rpd-edit-button"
                onClick={startEdit}
              >
                <Pencil size={15} /> 수정
              </button>
            )}
          </div>
          {editing ? (
            <>
              <label className="sr-only" htmlFor="report-title">
                제목
              </label>
              <input
                id="report-title"
                className="rpd-title-input"
                value={draft.title}
                maxLength={200}
                onChange={(event) =>
                  setDraft((previous) => ({ ...previous, title: event.target.value }))
                }
              />
            </>
          ) : (
            <h1>{post.title}</h1>
          )}
          <div className="rpd-meta">
            <span>{formatDateTime(post.created_at)}</span>
            <i />
            <span>
              <Eye size={13} /> —
            </span>
          </div>
        </header>
        <div className="rpd-layout">
          <div className="rpd-primary">
            {editing ? (
              <form
                className="rpd-edit-form"
                onSubmit={(event) => {
                  event.preventDefault();
                  void saveEdit();
                }}
              >
                <div className="rpd-body-head">
                  <span className="field-label" id="report-body-label">
                    본문
                  </span>
                  <div className="rpd-body-modes" role="group" aria-label="본문 편집 방식">
                    <button
                      type="button"
                      aria-pressed={bodyMode === 'blocks'}
                      className={bodyMode === 'blocks' ? 'active' : undefined}
                      onClick={() => setBodyMode('blocks')}
                    >
                      표 그리드
                    </button>
                    <button
                      type="button"
                      aria-pressed={bodyMode === 'markdown'}
                      className={bodyMode === 'markdown' ? 'active' : undefined}
                      onClick={() => setBodyMode('markdown')}
                    >
                      전체 마크다운
                    </button>
                  </div>
                </div>
                {bodyMode === 'blocks' ? (
                  <>
                    <p className="rpd-edit-hint">
                      본문은 마크다운으로 고칩니다. 표는 본문 위치의 그리드에서 셀·행·열을 고치고,
                      위·아래 버튼으로 위치를 옮길 수 있어요. 셀에는 | 문자를 넣을 수 없어요.
                    </p>
                    <div
                      className="rpd-body-editor"
                      role="group"
                      aria-labelledby="report-body-label"
                    >
                      {bodyEditor}
                    </div>
                  </>
                ) : (
                  <>
                    <p className="rpd-edit-hint">
                      표를 문단 중간에 넣거나 다른 곳의 표를 붙여넣으려면 여기서 마크다운을 직접
                      고치세요. 표 그리드로 돌아오면 표를 다시 인식합니다.
                    </p>
                    <textarea
                      className="rpd-body-raw"
                      aria-label="본문 마크다운"
                      value={draft.bodyMarkdown}
                      onChange={(event) =>
                        setDraft((previous) => ({ ...previous, bodyMarkdown: event.target.value }))
                      }
                    />
                  </>
                )}
                {editError && (
                  <p className="rpd-edit-error" role="alert">
                    {editError}
                  </p>
                )}
                <div className="form-footer">
                  <small>{draft.bodyMarkdown.length.toLocaleString('ko-KR')}자</small>
                  <div className="rpd-edit-actions">
                    <button
                      type="button"
                      className="button button-white"
                      disabled={editSaving}
                      onClick={cancelEdit}
                    >
                      취소
                    </button>
                    <button type="submit" className="button button-primary" disabled={editSaving}>
                      {editSaving ? '저장 중…' : '저장'}
                    </button>
                  </div>
                </div>
              </form>
            ) : (
              <>
                <div className="rpd-body report-markdown">
                  <ReportMarkdown markdown={post.body_markdown} />
                </div>
                <section className="rpd-request" aria-label="요청 및 확인 사항">
                  <div className="rpd-request-head">
                    <h2>
                      <ClipboardList size={16} />
                      요청 및 확인 사항
                    </h2>
                    <span className="rpd-request-count">
                      {completedCount}/{checklist.length} 완료
                    </span>
                  </div>
                  {checklist.length ? (
                    <>
                      {!tasks.fromSnapshot && (
                        <p className="rpd-request-hint">
                          집계 정보가 없어 {categoryLabels[post.category]} 기본 점검 항목을
                          표시해요.
                        </p>
                      )}
                      <ul className="rpd-checklist">
                        {checklist.map((item, itemIndex) => (
                          <li key={`${item}-${itemIndex}`}>
                            <label className={checked[itemIndex] ? 'is-done' : undefined}>
                              <input
                                type="checkbox"
                                checked={checked[itemIndex]}
                                onChange={() => toggleItem(itemIndex)}
                              />
                              <span>{item}</span>
                            </label>
                          </li>
                        ))}
                      </ul>
                    </>
                  ) : (
                    <p className="rt-empty">보고에 확인 사항이 없어요.</p>
                  )}
                </section>
              </>
            )}
          </div>
          <aside className="rpd-side">
            <section className="rpd-summary" aria-label="작성자 및 설비 정보">
              <h2>작성자 · 설비</h2>
              <dl>
                <div>
                  <dt>작성자</dt>
                  <dd>{post.author_display_name}</dd>
                </div>
                {post.last_editor_id !== null && (
                  <div>
                    <dt>수정자</dt>
                    <dd>{post.last_editor_display_name ?? '—'}</dd>
                  </div>
                )}
                <div>
                  <dt>설비</dt>
                  <dd title={equipmentNames.join(', ') || undefined}>{equipmentLabel || '—'}</dd>
                </div>
                <div>
                  <dt>등록</dt>
                  <dd>{formatDateTime(post.created_at)}</dd>
                </div>
                {post.last_editor_id !== null && (
                  <div>
                    <dt>수정</dt>
                    <dd>{formatDateTime(post.updated_at)}</dd>
                  </div>
                )}
              </dl>
            </section>
            <section className="rpd-status-card" aria-label="처리 상태 변경">
              <span className="rpd-status-label">처리 상태</span>
              <div className="rpd-status-group" role="group" aria-busy={saving}>
                {statusOptions.map((option) => (
                  <button
                    key={option}
                    type="button"
                    data-status={option}
                    className={option === currentStatus ? 'current' : undefined}
                    aria-pressed={option === currentStatus}
                    disabled={editing}
                    onClick={() => void changeStatus(option)}
                  >
                    {option}
                  </button>
                ))}
              </div>
              <button
                type="button"
                className="button button-white rpd-pdf"
                disabled={downloading}
                onClick={() => void downloadPdf()}
              >
                <Download size={15} /> {downloading ? 'PDF 준비 중…' : 'PDF 다운로드'}
              </button>
              {statusError && (
                <p className="rt-empty" role="alert">
                  {statusError}
                </p>
              )}
            </section>
            <button
              type="button"
              className="rpd-handover"
              disabled={editing}
              aria-haspopup="dialog"
              onClick={openHandover}
            >
              <span className="rpd-handover-icon">
                <ClipboardList size={18} />
              </span>
              <span className="rpd-handover-copy">
                <strong>인수인계로 기록</strong>
              </span>
              <ArrowRight size={16} />
            </button>
            {handoverNotice && (
              <p className="rpd-handover-notice" role="status">
                <Check size={14} /> {handoverNotice}
              </p>
            )}
          </aside>
        </div>
      </article>
      <nav className="rpd-nav" aria-label="이전·다음 보고">
        {newer ? (
          <Link to={`/reports/${newer.report_id}`}>
            <small>이전 글</small>
            <strong>{newer.title}</strong>
          </Link>
        ) : (
          <span />
        )}
        {older ? (
          <Link className="next" to={`/reports/${older.report_id}`}>
            <small>다음 글</small>
            <strong>{older.title}</strong>
          </Link>
        ) : (
          <span />
        )}
      </nav>
      {handoverOpen && (
        <Modal
          title="인수인계로 기록"
          onClose={() => {
            if (!handoverSaving) setHandoverOpen(false);
          }}
        >
          <form className="rpd-edit-form" onSubmit={submitHandover}>
            <p className="rpd-handover-target">
              <strong>{post.title}</strong> 보고의 조치 결과를 다음 근무자에게 전달합니다.
            </p>
            <label className="field-label" htmlFor="rpd-handover-body">
              전달할 내용
            </label>
            <textarea
              id="rpd-handover-body"
              className="note-input"
              value={handoverText}
              rows={6}
              onChange={(event) => setHandoverText(event.target.value)}
              required
            />
            {handoverError && (
              <p className="rpd-edit-error" role="alert">
                {handoverError}
              </p>
            )}
            <div className="form-footer rpd-handover-footer">
              <small>{handoverText.length.toLocaleString('ko-KR')}자</small>
              <div className="rpd-edit-actions">
                <button
                  type="button"
                  className="button button-white button-sm"
                  disabled={handoverSaving}
                  onClick={() => setHandoverOpen(false)}
                >
                  <X size={14} />
                  취소
                </button>
                <button
                  type="submit"
                  className="button button-primary button-sm"
                  disabled={handoverSaving || !handoverText.trim()}
                >
                  <Check size={15} />
                  {handoverSaving ? '저장 중…' : '노트 저장'}
                </button>
              </div>
            </div>
          </form>
        </Modal>
      )}
    </section>
  );
}
